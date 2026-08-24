"""CacaoQ — Construye el system prompt dinámico para Claude."""

from datetime import date

from engine.risk import compute_risk
from db.models import get_latest_options_board

_MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def _today_es() -> str:
    t = date.today()
    return f"{t.day} de {_MESES_ES[t.month - 1]} de {t.year}"


def build_system_prompt() -> str:
    """Construye el system prompt con todos los datos actuales.

    El Market Intelligence de StoneX ya NO se pre-inyecta aquí; el modelo
    tiene tools (list_intel_articles, get_intel_article, get_latest_cocoa_intel)
    y decide en runtime qué consultar.
    """
    risk = compute_risk()
    phys = risk["physical"]
    hedge = risk["hedge"]
    pnl = risk["pnl"]
    market = risk["market"]
    balance = risk["balance"]
    margin = risk["margin"]
    collar = hedge.get("collar")

    # --- Datos de mercado ---
    market_section = "## Datos de Mercado Actuales\n"
    if market["cacao_price_usd"]:
        market_section += f"- Precio cacao ICE NY: **USD {market['cacao_price_usd']:,.2f}/ton**\n"
    else:
        market_section += "- Precio cacao: No disponible\n"
    if market["trm"]:
        market_section += f"- TRM (USD/COP): **{market['trm']:,.2f}**\n"
    if market.get("max_safe_price_cop_kg"):
        market_section += f"- Precio máximo seguro de compra: **COP {market['max_safe_price_cop_kg']:,.0f}/kg**\n"

    # --- Inventario físico ---
    inv_section = "## Inventario Físico\n"
    inv_section += f"- Total comprado: **{phys.get('total_purchased', phys['total_tonnes']):.1f} toneladas**\n"
    if phys.get("sold_locally", 0) > 0:
        inv_section += f"- Vendido localmente: **{phys['sold_locally']:.1f} toneladas** (precio prom: COP {phys.get('avg_sale_price_cop_kg', 0):,.0f}/kg)\n"
    inv_section += f"- **Exposición neta: {phys['total_tonnes']:.1f} toneladas** (lo que necesita cobertura)\n"
    for status, tonnes in phys["by_status"].items():
        inv_section += f"  - {status.capitalize()}: {tonnes:.1f} ton\n"
    if phys["avg_purchase_price_cop_kg"] > 0:
        inv_section += f"- Precio promedio de compra: **COP {phys['avg_purchase_price_cop_kg']:,.0f}/kg**\n"

    # --- Posiciones del broker ---
    pos_section = "## Posiciones del Broker (StoneX)\n"
    if risk["positions"]:
        for pos in risk["positions"]:
            side = "LONG" if pos["long_qty"] > 0 else "SHORT"
            qty = pos["long_qty"] or pos["short_qty"]
            otype = pos["option_type"] or "FUTURE"
            pos_section += (
                f"- {qty} {otype} {side} | Strike: {pos['strike']} | "
                f"Mes: {pos['contract_month']} | Settle: {pos['settle_price']} | "
                f"Valor: USD {pos['market_value']:,.2f} ({pos['dr_cr']})\n"
            )
    else:
        pos_section += "- Sin posiciones abiertas\n"

    # --- Balance ---
    bal_section = "## Balance de la Cuenta\n"
    if balance:
        bal_section += f"- Net Liquidating Value: **USD {(balance.get('net_liquidating_value') or 0):,.2f}**\n"
        bal_section += f"- Total Equity: USD {(balance.get('total_equity') or 0):,.2f}\n"
        bal_section += f"- Valor opciones neto: USD {(balance.get('net_option_value') or 0):,.2f}\n"
        bal_section += f"- Margen inicial: USD {(balance.get('initial_margin') or 0):,.2f}\n"
        bal_section += f"- Equity disponible: **USD {(balance.get('excess_equity') or 0):,.2f}**\n"
        bal_section += f"- Varianza del mercado: USD {(balance.get('market_variance') or 0):,.2f}\n"
    else:
        bal_section += "- Sin datos de balance\n"

    # --- Análisis de riesgo ---
    risk_section = "## Análisis de Riesgo\n"
    risk_section += f"- Toneladas cubiertas: **{hedge['covered_tonnes']:.1f} / {phys['total_tonnes']:.1f}** ({hedge['coverage_pct']}%)\n"
    risk_section += f"- Toneladas descubiertas: **{hedge['uncovered_tonnes']:.1f}**\n"

    if collar:
        risk_section += f"\n### Collar\n"
        risk_section += f"- Piso (PUT): **USD {collar['floor']:,.0f}/ton**\n"
        risk_section += f"- Techo (CALL): **USD {collar['cap']:,.0f}/ton**\n"
        risk_section += f"- Contratos: {collar['contracts']}\n"
        risk_section += f"- Toneladas protegidas: {collar['tonnes']:.0f}\n"
        risk_section += f"- Prima neta: USD {collar['net_premium']:.2f}/ton\n"

    # --- P&L ---
    pnl_section = "## P&L\n"
    pnl_section += f"- P&L no realizado coberturas (opciones): **USD {pnl['unrealized_hedge_usd']:,.2f}**\n"
    if pnl["unrealized_physical_cop"] != 0:
        pnl_section += f"- P&L no realizado inventario físico: **COP {pnl['unrealized_physical_cop']:,.0f}**\n"
    pnl_section += f"- P&L realizado MTD: USD {pnl['realized_mtd']:,.2f}\n"
    pnl_section += f"- P&L realizado YTD: USD {pnl['realized_ytd']:,.2f}\n"

    # --- Escenarios ---
    scenario_section = ""
    if risk["scenarios"]:
        scenario_section = "## Escenarios de Precio\n"
        scenario_section += "| Cambio | Precio | Collar P&L | Físico P&L | Neto |\n"
        scenario_section += "|--------|--------|------------|------------|------|\n"
        for s in risk["scenarios"]:
            scenario_section += (
                f"| {s['price_change_pct']:+d}% | USD {s['price_usd']:,.0f} | "
                f"USD {s['collar_pnl_usd']:,.0f} | USD {s['physical_pnl_usd']:,.0f} | "
                f"USD {s['net_pnl_usd']:,.0f} |\n"
            )

    # --- Capacidad de margen ---
    margin_section = "## Capacidad de Margen\n"
    margin_section += f"- Equity excedente: USD {margin['excess_equity']:,.2f}\n"
    margin_section += f"- Contratos adicionales posibles: {margin['additional_contracts_possible']}\n"
    margin_section += f"- Toneladas adicionales cubribles: {margin['additional_tonnes_possible']}\n"

    # --- Tablero de opciones ---
    options_section = ""
    board = get_latest_options_board()
    if board:
        options_section = f"## Tablero de Opciones Disponibles ({board['date']})\n"
        options_section += f"- Contrato: **{board['contract_month']}**\n"
        options_section += f"- Precio subyacente: **USD {(board.get('underlying_price') or 0):,.0f}**\n"
        options_section += f"- DTE: **{board.get('dte') or 0} días** (Exp: {board['expiration']})\n"
        options_section += f"- Volatilidad implícita: Calls {(board.get('volatility_calls') or 0):.1f}% / Puts {(board.get('volatility_puts') or 0):.1f}%\n"
        options_section += f"- Tasa: {(board.get('interest_rate') or 0):.2f}%\n\n"
        options_section += "| Strike | Call Prima | Call Delta | Put Prima | Put Delta |\n"
        options_section += "|--------|-----------|-----------|----------|----------|\n"
        # Filtrar strikes relevantes (cerca del underlying ±30%)
        underlying = board.get("underlying_price") or 0
        low_bound = underlying * 0.70
        high_bound = underlying * 1.30
        for s in board["strikes"]:
            strike = s.get("strike") or 0
            if low_bound <= strike <= high_bound:
                options_section += (
                    f"| {strike:,.0f} | {(s.get('call_premium') or 0):,.0f} | "
                    f"{(s.get('call_delta') or 0):.2f} | {(s.get('put_premium') or 0):,.0f} | "
                    f"{(s.get('put_delta') or 0):.2f} |\n"
                )
        options_section += "\n*Solo se muestran strikes ±30% del precio actual. Hay datos para todo el rango.*\n"

    # --- System prompt completo ---
    system_prompt = f"""Eres el analista de riesgo de AROCO SAS, un exportador colombiano de cacao fino de aroma. Tu nombre es CacaoQ.

**Fecha de hoy: {_today_es()} ({date.today().isoformat()}).** Usa esta fecha en cualquier encabezado o referencia temporal del reporte. No infieras la fecha de los datos de statements o mercado — esos pueden estar rezagados.

## Reglas de comportamiento
- Responde SIEMPRE en español
- Sé específico y cuantitativo: usa números exactos de los datos proporcionados
- Nunca des consejo financiero definitivo — presenta análisis y opciones
- Si no tienes datos suficientes para responder algo, dilo claramente
- Usa formato markdown para organizar tus respuestas
- El mercado de referencia es ICE NY Cocoa (futuros y opciones)
- Los precios del físico están en COP/kg, las coberturas en USD/tonelada
- 1 contrato ICE Cocoa = 10 toneladas métricas

## Contexto actual de AROCO SAS

{market_section}
{inv_section}
{pos_section}
{bal_section}
{risk_section}
{pnl_section}
{scenario_section}
{margin_section}
{options_section}

## Inteligencia de Mercado (StoneX MI) — bajo demanda vía tools

Tienes acceso al feed completo de **StoneX Market Intelligence** (intel.stonex.com)
a través de tres tools. NO confíes en tu conocimiento pre-entrenado sobre el
mercado de cacao — consulta el MI cuando el usuario pregunte por:

- Noticias, reportes o análisis recientes (supply/demand, weather, política
  comercial, COT positioning, Costa de Marfil, Ghana, Indonesia, etc.)
- Razones detrás del movimiento del precio
- Outlook técnico o fundamental
- Posicionamiento de fondos (managed money)
- Cualquier evento de mercado que requiera contexto cualitativo

Tools:
- `list_intel_articles(market_id=16974, page_size=20, only_primary=False)` —
  lista metadata (id, title, abstract, date) de artículos del mercado de cocoa.
- `get_intel_article(article_id)` — contenido completo de un artículo por su UUID.
- `get_latest_cocoa_intel(limit=3, only_primary=True)` — atajo: los N más
  recientes de cocoa con contenido completo.

**Estrategia recomendada**: primero `list_intel_articles` para descubrir títulos
relevantes, luego `get_intel_article` para los 1-3 que parezcan más útiles a la
pregunta. Para preguntas amplias "qué está pasando" puedes ir directo a
`get_latest_cocoa_intel`. Cita los artículos por título y fecha cuando los uses.

## Notas importantes
- Cuando el usuario pregunte sobre estrategias de cobertura, usa el tablero de opciones disponibles para recomendar strikes específicos con sus primas y deltas reales
- Para collars: recomienda combinaciones PUT comprado + CALL vendido mostrando costo neto, rango de protección y break-even
- El collar (PUT comprado + CALL vendido) protege contra caídas pero limita ganancias
- La TRM afecta directamente el margen de exportación
- El inventario físico no cubierto está expuesto al riesgo de precio
- Monitorear el exceso de equity para posibles margin calls
"""
    return system_prompt


def build_morning_analysis_prompt() -> str:
    """Prompt predefinido para el análisis matutino."""
    return """Por favor genera el análisis matutino completo de AROCO SAS. Incluye:

1. **Resumen de posición**: Estado actual del inventario y coberturas
2. **Mercado**: Movimiento del precio del cacao y su impacto en nuestra posición
3. **Riesgo**: Análisis del collar, toneladas descubiertas, y margen disponible
4. **TRM**: Impacto de la tasa de cambio en el negocio
5. **Recomendaciones**: Puntos de atención y posibles acciones (sin ser consejo definitivo)
6. **Escenarios**: Qué pasa si el mercado sube o baja 5-10%

Sé conciso pero completo."""
