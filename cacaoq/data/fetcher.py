"""CacaoQ — Orquestador de actualización de datos de mercado."""

from data.market import get_cacao_price
from data.fx import get_trm_latest, get_usdcop_spot
from db.models import upsert_market_data, upsert_trm, get_latest_market_price, get_latest_trm


def refresh_market_data() -> dict:
    """Actualiza precio de cacao, TRM oficial y USD/COP spot."""
    result = {"cacao": None, "trm": None, "usdcop_spot": None}

    # Precio cacao (contrato activo)
    cacao = get_cacao_price()
    if cacao:
        upsert_market_data(
            date=cacao["date"],
            ticker=cacao.get("contract", "CC=F"),
            close_price=cacao["close"],
            open_price=cacao["open"],
            high=cacao["high"],
            low=cacao["low"],
            volume=cacao["volume"],
        )
        result["cacao"] = cacao

    # TRM oficial
    trm = get_trm_latest()
    if trm:
        upsert_trm(date=trm["date"], trm=trm["trm"])
        result["trm"] = trm

    # USD/COP spot en tiempo real
    spot = get_usdcop_spot()
    if spot:
        result["usdcop_spot"] = spot

    return result


def get_current_data() -> dict:
    """Retorna los datos más recientes disponibles."""
    cacao = get_latest_market_price()
    trm = get_latest_trm()
    spot = get_usdcop_spot()
    return {
        "cacao": cacao,
        "trm": trm,
        "usdcop_spot": spot,
    }
