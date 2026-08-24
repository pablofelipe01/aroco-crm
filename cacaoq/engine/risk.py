"""CacaoQ — Motor de análisis de riesgo."""

from config import CACAO_CONTRACT_SIZE, MARGIN_PER_CONTRACT
from db.models import (
    get_active_inventory, get_latest_positions, get_latest_balance,
    get_latest_market_price, get_latest_trm, get_latest_pnl,
    get_sales_summary,
)


def compute_risk() -> dict:
    """
    Calcula análisis de riesgo cruzando inventario físico vs posiciones broker.
    Retorna dict con todas las métricas.
    """
    inventory = get_active_inventory()
    positions = get_latest_positions()
    balance = get_latest_balance()
    market = get_latest_market_price()
    trm_data = get_latest_trm()
    pnl = get_latest_pnl()

    cacao_price = market["close_price"] if market else None
    trm = trm_data["trm"] if trm_data else None

    # --- Inventario físico ---
    total_purchased = sum(item["tonnes"] for item in inventory)
    sales = get_sales_summary()
    sold_tonnes = sales["total_tonnes"]
    total_tonnes = max(0, total_purchased - sold_tonnes)

    by_status = {}
    for item in inventory:
        s = item["status"]
        by_status[s] = by_status.get(s, 0) + item["tonnes"]

    avg_purchase_price_cop = 0.0
    if inventory and total_purchased > 0:
        total_cost = sum(item["tonnes"] * item["price_cop_kg"] * 1000 for item in inventory)
        avg_purchase_price_cop = total_cost / (total_purchased * 1000)  # COP/kg

    # --- Posiciones del broker ---
    calls_short = []
    puts_long = []
    futures_long = []
    futures_short = []

    for pos in positions:
        if pos["option_type"] == "CALL" and pos["short_qty"] > 0:
            calls_short.append(pos)
        elif pos["option_type"] == "PUT" and pos["long_qty"] > 0:
            puts_long.append(pos)
        elif pos["option_type"] == "FUTURE":
            if pos["long_qty"] > 0:
                futures_long.append(pos)
            if pos["short_qty"] > 0:
                futures_short.append(pos)

    # Toneladas cubiertas (por opciones y futuros)
    covered_by_puts = sum(p["long_qty"] * CACAO_CONTRACT_SIZE for p in puts_long)
    covered_by_calls = sum(c["short_qty"] * CACAO_CONTRACT_SIZE for c in calls_short)
    covered_by_futures = sum(f["short_qty"] * CACAO_CONTRACT_SIZE for f in futures_short)
    # Collar: la cobertura es el mínimo entre puts y calls (ambas patas)
    collar_contracts = min(
        sum(p["long_qty"] for p in puts_long),
        sum(c["short_qty"] for c in calls_short)
    ) if puts_long and calls_short else 0
    collar_tonnes = collar_contracts * CACAO_CONTRACT_SIZE

    total_covered = collar_tonnes + covered_by_futures
    uncovered = max(0, total_tonnes - total_covered)
    coverage_pct = (total_covered / total_tonnes * 100) if total_tonnes > 0 else 0

    # --- Análisis del collar ---
    collar = None
    if puts_long and calls_short:
        collar_floor = puts_long[0]["strike"] if puts_long else None
        collar_cap = calls_short[0]["strike"] if calls_short else None
        collar = {
            "floor": collar_floor,           # Piso (PUT strike)
            "cap": collar_cap,               # Techo (CALL strike)
            "contracts": collar_contracts,
            "tonnes": collar_tonnes,
            "put_premium": puts_long[0]["settle_price"] if puts_long else 0,
            "call_premium": calls_short[0]["settle_price"] if calls_short else 0,
            "net_premium": (
                (puts_long[0]["settle_price"] if puts_long else 0)
                - (calls_short[0]["settle_price"] if calls_short else 0)
            ),
        }

    # --- P&L no realizado ---
    unrealized_pnl_hedge = 0.0
    if balance:
        unrealized_pnl_hedge = balance.get("net_option_value", 0) or 0

    unrealized_pnl_physical = 0.0
    if cacao_price and trm and total_tonnes > 0:
        # Valor de mercado del inventario en COP
        market_value_cop_kg = cacao_price * trm / 1000  # USD/ton → COP/kg
        unrealized_pnl_physical = (market_value_cop_kg - avg_purchase_price_cop) * total_tonnes * 1000

    # --- Escenarios de precio ---
    scenarios = []
    if cacao_price and collar:
        for pct in [-10, -5, 0, 5, 10]:
            scenario_price = cacao_price * (1 + pct / 100)
            # Valor del collar bajo escenario
            collar_pnl = 0.0
            if collar["floor"] and scenario_price < collar["floor"]:
                collar_pnl = (collar["floor"] - scenario_price) * collar_tonnes
            elif collar["cap"] and scenario_price > collar["cap"]:
                collar_pnl = (collar["cap"] - scenario_price) * collar_tonnes

            # Valor del físico bajo escenario (en USD)
            physical_pnl = (scenario_price - cacao_price) * total_tonnes if total_tonnes else 0

            scenarios.append({
                "price_change_pct": pct,
                "price_usd": round(scenario_price, 2),
                "collar_pnl_usd": round(collar_pnl, 2),
                "physical_pnl_usd": round(physical_pnl, 2),
                "net_pnl_usd": round(physical_pnl + collar_pnl, 2),
            })

    # --- Margen y capacidad ---
    excess_equity = balance.get("excess_equity", 0) if balance else 0
    additional_contracts = int(excess_equity / MARGIN_PER_CONTRACT) if excess_equity > 0 else 0

    # Precio máximo de compra seguro (en COP/kg)
    max_safe_price_cop = None
    if cacao_price and trm and collar and collar["floor"]:
        max_safe_price_cop = collar["floor"] * trm / 1000  # Piso del collar en COP/kg

    return {
        "timestamp": None,  # se llena al guardar
        "physical": {
            "total_purchased": total_purchased,
            "sold_locally": sold_tonnes,
            "total_tonnes": total_tonnes,
            "by_status": by_status,
            "avg_purchase_price_cop_kg": round(avg_purchase_price_cop, 2),
            "avg_sale_price_cop_kg": round(sales["avg_price_cop_kg"], 2),
        },
        "hedge": {
            "covered_tonnes": total_covered,
            "uncovered_tonnes": uncovered,
            "coverage_pct": round(coverage_pct, 1),
            "collar": collar,
            "futures_short": [dict(f) for f in futures_short],
            "futures_long": [dict(f) for f in futures_long],
        },
        "pnl": {
            "unrealized_physical_cop": round(unrealized_pnl_physical, 2),
            "unrealized_hedge_usd": round(unrealized_pnl_hedge, 2),
            "realized_mtd": pnl["realized_pnl_mtd"] if pnl else 0,
            "realized_ytd": pnl["realized_pnl_ytd"] if pnl else 0,
        },
        "scenarios": scenarios,
        "margin": {
            "excess_equity": excess_equity,
            "additional_contracts_possible": additional_contracts,
            "additional_tonnes_possible": additional_contracts * CACAO_CONTRACT_SIZE,
        },
        "market": {
            "cacao_price_usd": cacao_price,
            "trm": trm,
            "max_safe_price_cop_kg": max_safe_price_cop,
        },
        "balance": dict(balance) if balance else None,
        "positions": [dict(p) for p in positions],
    }
