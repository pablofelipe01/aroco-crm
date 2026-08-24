"""CacaoQ — Funciones CRUD para todas las tablas."""

from datetime import datetime
from db.database import get_connection


# ─── Physical Inventory ───────────────────────────────────────────────

def insert_inventory(date: str, tonnes: float, price_cop_kg: float,
                     supplier: str = None, region: str = None,
                     status: str = "bodega", shipment_date: str = None,
                     notes: str = None) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO physical_inventory
           (date, tonnes, price_cop_kg, supplier, region, status, shipment_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (date, tonnes, price_cop_kg, supplier, region, status, shipment_date, notes)
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_all_inventory():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM physical_inventory ORDER BY date DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_active_inventory():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM physical_inventory WHERE status NOT IN ('entregado') ORDER BY date DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_inventory_by_external_id(external_id: str) -> dict | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM physical_inventory WHERE external_id=?",
        (external_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_inventory_by_external_id(external_id: str, date: str, tonnes: float,
                                     price_cop_kg: float, supplier: str | None = None,
                                     region: str | None = None, status: str = "bodega",
                                     shipment_date: str | None = None,
                                     notes: str | None = None) -> tuple[int, bool]:
    """Inserta o actualiza una fila usando external_id como clave de dedup.

    Returns:
        (inventory_id, was_inserted) — was_inserted=True si fue INSERT, False si UPDATE.
    """
    from datetime import datetime
    conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM physical_inventory WHERE external_id=?",
        (external_id,)
    ).fetchone()
    if existing:
        row_id = existing["id"]
        conn.execute(
            """UPDATE physical_inventory SET
               date=?, tonnes=?, price_cop_kg=?, supplier=?, region=?,
               status=?, shipment_date=?, notes=?, updated_at=?
               WHERE id=?""",
            (date, tonnes, price_cop_kg, supplier, region, status,
             shipment_date, notes, datetime.now().isoformat(), row_id)
        )
        conn.commit()
        conn.close()
        return row_id, False
    cur = conn.execute(
        """INSERT INTO physical_inventory
           (date, tonnes, price_cop_kg, supplier, region, status,
            shipment_date, notes, external_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (date, tonnes, price_cop_kg, supplier, region, status,
         shipment_date, notes, external_id)
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id, True


def update_inventory_status(inventory_id: int, status: str):
    conn = get_connection()
    conn.execute(
        "UPDATE physical_inventory SET status=?, updated_at=? WHERE id=?",
        (status, datetime.now().isoformat(), inventory_id)
    )
    conn.commit()
    conn.close()


def update_inventory(inventory_id: int, date: str, tonnes: float, price_cop_kg: float,
                     supplier: str = None, region: str = None, status: str = "bodega",
                     shipment_date: str = None, notes: str = None):
    conn = get_connection()
    conn.execute(
        """UPDATE physical_inventory SET
           date=?, tonnes=?, price_cop_kg=?, supplier=?, region=?,
           status=?, shipment_date=?, notes=?, updated_at=?
           WHERE id=?""",
        (date, tonnes, price_cop_kg, supplier, region, status,
         shipment_date, notes, datetime.now().isoformat(), inventory_id)
    )
    conn.commit()
    conn.close()


def delete_inventory(inventory_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM physical_inventory WHERE id=?", (inventory_id,))
    conn.commit()
    conn.close()


# ─── Local Sales ─────────────────────────────────────────────────────

def insert_local_sale(date: str, tonnes: float, price_cop_kg: float,
                      inventory_id: int = None, buyer: str = None,
                      notes: str = None) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO local_sales (date, inventory_id, tonnes, price_cop_kg, buyer, notes)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (date, inventory_id, tonnes, price_cop_kg, buyer, notes)
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_all_local_sales():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM local_sales ORDER BY date DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_total_sold_tonnes() -> float:
    conn = get_connection()
    row = conn.execute(
        "SELECT COALESCE(SUM(tonnes), 0) as total FROM local_sales"
    ).fetchone()
    conn.close()
    return float(row["total"])


def get_sales_summary() -> dict:
    """Resumen de ventas locales: total toneladas, ingreso promedio, etc."""
    conn = get_connection()
    row = conn.execute(
        """SELECT
            COALESCE(SUM(tonnes), 0) as total_tonnes,
            COALESCE(SUM(tonnes * price_cop_kg * 1000), 0) as total_revenue_cop,
            COUNT(*) as num_sales
           FROM local_sales"""
    ).fetchone()
    conn.close()
    result = dict(row)
    if result["total_tonnes"] > 0:
        result["avg_price_cop_kg"] = result["total_revenue_cop"] / (result["total_tonnes"] * 1000)
    else:
        result["avg_price_cop_kg"] = 0
    return result


def delete_local_sale(sale_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM local_sales WHERE id=?", (sale_id,))
    conn.commit()
    conn.close()


# ─── Broker Positions ─────────────────────────────────────────────────

def insert_position(statement_date: str, account: str, trade_date: str = None,
                    card: str = None, long_qty: int = 0, short_qty: int = 0,
                    option_type: str = None, contract_month: str = None,
                    exchange: str = "ICE COCOA", strike: float = None,
                    settle_price: float = None, market_value: float = None,
                    dr_cr: str = None) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO broker_positions
           (statement_date, account, trade_date, card, long_qty, short_qty,
            option_type, contract_month, exchange, strike, settle_price, market_value, dr_cr)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (statement_date, account, trade_date, card, long_qty, short_qty,
         option_type, contract_month, exchange, strike, settle_price, market_value, dr_cr)
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_positions_by_date(statement_date: str):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM broker_positions WHERE statement_date=? ORDER BY id",
        (statement_date,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_latest_positions():
    conn = get_connection()
    rows = conn.execute(
        """SELECT * FROM broker_positions
           WHERE statement_date = (SELECT MAX(statement_date) FROM broker_positions)
           ORDER BY id"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Account Balance ──────────────────────────────────────────────────

def insert_balance(statement_date: str, account: str, **kwargs) -> int:
    fields = ["beginning_balance", "ending_balance", "total_equity",
              "long_option_value", "short_option_value", "net_option_value",
              "net_liquidating_value", "prior_net_liquidating_value",
              "market_variance", "initial_margin", "maintenance_margin",
              "excess_equity"]
    values = {f: kwargs.get(f) for f in fields}
    cols = ", ".join(["statement_date", "account"] + list(values.keys()))
    placeholders = ", ".join(["?"] * (2 + len(values)))
    params = [statement_date, account] + list(values.values())

    conn = get_connection()
    cur = conn.execute(
        f"INSERT INTO account_balance ({cols}) VALUES ({placeholders})", params
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_latest_balance():
    conn = get_connection()
    row = conn.execute(
        """SELECT * FROM account_balance
           WHERE statement_date = (SELECT MAX(statement_date) FROM account_balance)
           LIMIT 1"""
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Processed Statements ────────────────────────────────────────────

def insert_processed_statement(filename: str, statement_date: str,
                                account: str, file_hash: str,
                                num_positions: int) -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT OR IGNORE INTO processed_statements
           (filename, statement_date, account, file_hash, num_positions)
           VALUES (?, ?, ?, ?, ?)""",
        (filename, statement_date, account, file_hash, num_positions)
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def is_statement_processed(file_hash: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM processed_statements WHERE file_hash=?", (file_hash,)
    ).fetchone()
    conn.close()
    return row is not None


def get_all_processed_statements():
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM processed_statements ORDER BY statement_date DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Market Data ─────────────────────────────────────────────────────

def upsert_market_data(date: str, ticker: str, close_price: float,
                       open_price: float = None, high: float = None,
                       low: float = None, volume: float = None):
    conn = get_connection()
    conn.execute(
        """INSERT INTO market_data (date, ticker, close_price, open_price, high, low, volume)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(date, ticker) DO UPDATE SET
             close_price=excluded.close_price, open_price=excluded.open_price,
             high=excluded.high, low=excluded.low, volume=excluded.volume""",
        (date, ticker, close_price, open_price, high, low, volume)
    )
    conn.commit()
    conn.close()


def get_latest_market_price(ticker: str = None):
    conn = get_connection()
    if ticker:
        row = conn.execute(
            "SELECT * FROM market_data WHERE ticker=? ORDER BY date DESC LIMIT 1",
            (ticker,)
        ).fetchone()
    else:
        # Buscar el precio más reciente de cualquier contrato de cacao
        row = conn.execute(
            "SELECT * FROM market_data ORDER BY date DESC LIMIT 1"
        ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_market_history(ticker: str = "CC=F", days: int = 30):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM market_data WHERE ticker=? ORDER BY date DESC LIMIT ?",
        (ticker, days)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── TRM Data ────────────────────────────────────────────────────────

def upsert_trm(date: str, trm: float):
    conn = get_connection()
    conn.execute(
        """INSERT INTO trm_data (date, trm) VALUES (?, ?)
           ON CONFLICT(date) DO UPDATE SET trm=excluded.trm""",
        (date, trm)
    )
    conn.commit()
    conn.close()


def get_latest_trm():
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM trm_data ORDER BY date DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Chat History ────────────────────────────────────────────────────

def insert_chat_message(session_id: str, role: str, content: str):
    conn = get_connection()
    conn.execute(
        "INSERT INTO chat_history (session_id, role, content) VALUES (?, ?, ?)",
        (session_id, role, content)
    )
    conn.commit()
    conn.close()


def get_chat_history(session_id: str):
    conn = get_connection()
    rows = conn.execute(
        "SELECT role, content, created_at FROM chat_history WHERE session_id=? ORDER BY id",
        (session_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_all_sessions():
    conn = get_connection()
    rows = conn.execute(
        """SELECT session_id, MIN(created_at) as started, COUNT(*) as messages
           FROM chat_history GROUP BY session_id ORDER BY started DESC"""
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Risk Snapshots ──────────────────────────────────────────────────

def insert_risk_snapshot(**kwargs) -> int:
    fields = ["date", "total_physical_tonnes", "covered_tonnes", "coverage_pct",
              "cacao_price_usd", "trm", "net_liquidating_value",
              "unrealized_pnl_physical", "unrealized_pnl_hedge",
              "collar_floor", "collar_cap"]
    values = {f: kwargs.get(f) for f in fields if kwargs.get(f) is not None}
    cols = ", ".join(values.keys())
    placeholders = ", ".join(["?"] * len(values))
    conn = get_connection()
    cur = conn.execute(
        f"INSERT INTO risk_snapshots ({cols}) VALUES ({placeholders})",
        list(values.values())
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_latest_risk_snapshot():
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM risk_snapshots ORDER BY date DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Broker P&L ──────────────────────────────────────────────────────

def insert_broker_pnl(statement_date: str, account: str,
                      realized_pnl_mtd: float, realized_pnl_ytd: float,
                      currency: str = "USD") -> int:
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO broker_pnl
           (statement_date, account, realized_pnl_mtd, realized_pnl_ytd, currency)
           VALUES (?, ?, ?, ?, ?)""",
        (statement_date, account, realized_pnl_mtd, realized_pnl_ytd, currency)
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_latest_pnl():
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM broker_pnl ORDER BY statement_date DESC LIMIT 1"
    ).fetchone()
    conn.close()
    return dict(row) if row else None


# ─── Options Board ──────────────────────────────────────────────────

def upsert_options_board(date: str, contract_month: str, underlying_price: float,
                         dte: int, expiration: str, volatility_calls: float,
                         volatility_puts: float, interest_rate: float,
                         strikes: list[dict]) -> int:
    """Guarda un tablero de opciones completo (metadata + cadena de strikes)."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO options_board
           (date, contract_month, underlying_price, dte, expiration,
            volatility_calls, volatility_puts, interest_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(date, contract_month) DO UPDATE SET
             underlying_price=excluded.underlying_price, dte=excluded.dte,
             expiration=excluded.expiration, volatility_calls=excluded.volatility_calls,
             volatility_puts=excluded.volatility_puts, interest_rate=excluded.interest_rate""",
        (date, contract_month, underlying_price, dte, expiration,
         volatility_calls, volatility_puts, interest_rate)
    )
    # Obtener board_id
    row = conn.execute(
        "SELECT id FROM options_board WHERE date=? AND contract_month=?",
        (date, contract_month)
    ).fetchone()
    board_id = row["id"]

    # Insertar/actualizar strikes
    for s in strikes:
        conn.execute(
            """INSERT INTO options_chain
               (board_id, strike, call_premium, call_delta, put_premium, put_delta)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(board_id, strike) DO UPDATE SET
                 call_premium=excluded.call_premium, call_delta=excluded.call_delta,
                 put_premium=excluded.put_premium, put_delta=excluded.put_delta""",
            (board_id, s["strike"], s.get("call_premium"), s.get("call_delta"),
             s.get("put_premium"), s.get("put_delta"))
        )

    conn.commit()
    conn.close()
    return board_id


def get_latest_options_board() -> dict | None:
    """Retorna el tablero de opciones más reciente con toda la cadena."""
    conn = get_connection()
    board = conn.execute(
        "SELECT * FROM options_board ORDER BY date DESC LIMIT 1"
    ).fetchone()
    if not board:
        conn.close()
        return None
    board = dict(board)
    strikes = conn.execute(
        "SELECT * FROM options_chain WHERE board_id=? ORDER BY strike",
        (board["id"],)
    ).fetchall()
    conn.close()
    board["strikes"] = [dict(s) for s in strikes]
    return board
