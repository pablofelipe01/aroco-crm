"""CacaoQ — Parser de statements StoneX (PDF → datos estructurados)."""

import hashlib
import re
from pathlib import Path

import pdfplumber


def _parse_value(text: str) -> float:
    """Convierte '1,440.00DR' → -1440.00, '6,260.00CR' → 6260.00, '.00' → 0.0, '2,400.00-' → -2400.00."""
    text = text.strip()
    if not text or text == ".00":
        return 0.0
    negative = text.endswith("DR") or text.endswith("-")
    cleaned = text.replace(",", "").replace("DR", "").replace("CR", "").rstrip("-")
    val = float(cleaned)
    return -val if negative else val


def _parse_date(raw: str) -> str:
    """Convierte 'MAR 2, 2026' → '2026-03-02'."""
    months = {
        "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
        "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
        "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12"
    }
    m = re.match(r"([A-Z]{3})\s+(\d{1,2}),?\s+(\d{4})", raw.strip())
    if m:
        month = months.get(m.group(1), "01")
        day = m.group(2).zfill(2)
        year = m.group(3)
        return f"{year}-{month}-{day}"
    return raw


def _file_hash(filepath: str) -> str:
    """SHA-256 del archivo para detectar duplicados."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_statement(filepath: str) -> dict:
    """
    Parsea un Daily Statement de StoneX.
    Retorna dict con: date, account, positions[], balance{}, pnl{}, file_hash
    """
    filepath = str(filepath)
    full_text = ""
    with pdfplumber.open(filepath) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"

    lines = full_text.split("\n")

    # --- Header ---
    statement_date = None
    account = None
    for line in lines:
        if "STATEMENT DATE:" in line:
            m = re.search(r"STATEMENT DATE:\s*(.+)", line)
            if m:
                statement_date = _parse_date(m.group(1).strip())
        if "ACCOUNT NUMBER:" in line:
            m = re.search(r"ACCOUNT NUMBER:\s*(\S+)", line)
            if m:
                account = m.group(1).strip()

    # --- Positions ---
    positions = []
    # Match position lines: trade_date card AT [long_qty] [short_qty] CALL/PUT MONTH YR ICE COCOA strike SE price CC value
    pos_pattern = re.compile(
        r"(\d+/\d+/\d+)\s+"           # trade_date
        r"(\d+)\s+"                    # card
        r"(\S+)\s+"                    # AT (segment, e.g. U1)
        r"(\d+)?\s*"                   # long_qty (optional)
        r"(\d+)?\s*"                   # short_qty (optional, if no long)
        r"(CALL|PUT|FUTURE)\s+"        # option_type
        r"([A-Z]{3}\s+\d{2})\s+"      # contract_month (e.g. MAY 26)
        r"ICE\s+COCOA\s+"             # exchange
        r"(\d+)\s+"                    # strike
        r"(\S+)\s+"                    # ST (e.g. SE)
        r"([\d.]+)\s+"                # settle_price
        r"(\S+)\s+"                    # CC (e.g. US)
        r"([\d,.]+(?:DR|CR))"         # market_value with DR/CR
    )

    for line in lines:
        m = pos_pattern.search(line)
        if m:
            trade_date = m.group(1)
            card = m.group(2)
            long_qty = int(m.group(4)) if m.group(4) else 0
            short_qty = int(m.group(5)) if m.group(5) else 0

            # Determine long vs short from position in line and context
            # If only one qty is present, determine from DR/CR:
            # CALL with DR → short, PUT with CR → long
            option_type = m.group(6)
            raw_qty_4 = m.group(4)
            raw_qty_5 = m.group(5)

            if raw_qty_4 and not raw_qty_5:
                # Single number before option_type — check context
                # Need to look at the original text to figure out if LONG or SHORT column
                # In the StoneX format, LONG column comes before SHORT column
                # If the value is under LONG → long_qty; if under SHORT → short_qty
                # Heuristic: DR values are short positions, CR values are long positions
                dr_cr = m.group(12)
                if dr_cr.endswith("DR"):
                    short_qty = int(raw_qty_4)
                    long_qty = 0
                else:
                    long_qty = int(raw_qty_4)
                    short_qty = 0

            market_value = _parse_value(m.group(12))
            positions.append({
                "trade_date": trade_date,
                "card": card,
                "long_qty": long_qty,
                "short_qty": short_qty,
                "option_type": option_type,
                "contract_month": m.group(7),
                "exchange": "ICE COCOA",
                "strike": float(m.group(8)),
                "settle_price": float(m.group(10)),
                "market_value": abs(market_value),
                "dr_cr": "DR" if market_value < 0 else "CR",
            })

    # --- Balances ---
    balance = {}
    balance_patterns = {
        "beginning_balance":           r"BEGINNING BALANCE\s+([\d,.]+(?:DR|CR))",
        "ending_balance":              r"ENDING BALANCE\s+([\d,.]+(?:DR|CR))",
        "total_equity":                r"TOTAL EQUITY\s+([\d,.]+(?:DR|CR))",
        "long_option_value":           r"LONG OPTION VALUE\s+([\d,.]+(?:DR|CR))",
        "short_option_value":          r"SHORT OPTION VALUE\s+([\d,.]+(?:DR|CR))",
        "net_option_value":            r"NET MARKET VALUE OF OPTIONS\s+([\d,.]+(?:DR|CR))",
        "net_liquidating_value":       r"CURRENT NET LIQUIDATING VALUE\s+([\d,.]+(?:DR|CR))",
        "prior_net_liquidating_value": r"PRIOR NET LIQUIDATING VALUE\s+([\d,.]+(?:DR|CR))",
        "market_variance":             r"MARKET VARIANCE\s+([\d,.]+(?:DR|CR))",
        "initial_margin":              r"INITIAL MARGIN REQUIREMENT\s+([\d,.]+(?:DR|CR))",
        "maintenance_margin":          r"MAINTENANCE MARGIN REQUIREMENT\s+([\d,.]+(?:DR|CR))",
        "excess_equity":               r"EXCESS EQUITY\s+([\d,.]+(?:DR|CR))",
    }
    for key, pattern in balance_patterns.items():
        m = re.search(pattern, full_text)
        if m:
            balance[key] = _parse_value(m.group(1))

    # --- P&L ---
    pnl = {"realized_pnl_mtd": 0.0, "realized_pnl_ytd": 0.0}
    # Look for: USD .00 2,400.00-
    pnl_match = re.search(
        r"USD\s+([\d,.]+[-]?)\s+([\d,.]+[-]?)", full_text
    )
    if pnl_match:
        pnl["realized_pnl_mtd"] = _parse_value(pnl_match.group(1))
        pnl["realized_pnl_ytd"] = _parse_value(pnl_match.group(2))

    return {
        "date": statement_date,
        "account": account,
        "positions": positions,
        "balance": balance,
        "pnl": pnl,
        "file_hash": _file_hash(filepath),
        "filename": Path(filepath).name,
    }


def parse_and_store(filepath: str) -> dict:
    """Parsea el statement y guarda en la base de datos. Retorna resultado del parse."""
    from db.models import (
        insert_position, insert_balance, insert_processed_statement,
        insert_broker_pnl, is_statement_processed
    )

    result = parse_statement(filepath)

    if is_statement_processed(result["file_hash"]):
        result["already_processed"] = True
        return result

    result["already_processed"] = False

    # Guardar posiciones
    for pos in result["positions"]:
        insert_position(
            statement_date=result["date"],
            account=result["account"],
            trade_date=pos["trade_date"],
            card=pos["card"],
            long_qty=pos["long_qty"],
            short_qty=pos["short_qty"],
            option_type=pos["option_type"],
            contract_month=pos["contract_month"],
            exchange=pos["exchange"],
            strike=pos["strike"],
            settle_price=pos["settle_price"],
            market_value=pos["market_value"],
            dr_cr=pos["dr_cr"],
        )

    # Guardar balance
    if result["balance"]:
        insert_balance(
            statement_date=result["date"],
            account=result["account"],
            **result["balance"]
        )

    # Guardar P&L
    insert_broker_pnl(
        statement_date=result["date"],
        account=result["account"],
        realized_pnl_mtd=result["pnl"]["realized_pnl_mtd"],
        realized_pnl_ytd=result["pnl"]["realized_pnl_ytd"],
    )

    # Marcar como procesado
    insert_processed_statement(
        filename=result["filename"],
        statement_date=result["date"],
        account=result["account"],
        file_hash=result["file_hash"],
        num_positions=len(result["positions"]),
    )

    return result


if __name__ == "__main__":
    import json
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "../dstm383983.pdf"
    result = parse_statement(path)
    print(json.dumps(result, indent=2, default=str))
