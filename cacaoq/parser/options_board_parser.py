"""CacaoQ — Parser de tablero de opciones via Claude Vision."""

import base64
import json
from anthropic import Anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL


def parse_options_board_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict | None:
    """
    Usa Claude Vision para parsear una captura del tablero de opciones.
    Retorna dict con metadata del tablero y lista de strikes con primas/deltas.
    """
    if not ANTHROPIC_API_KEY:
        return None

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    prompt = """Analiza esta imagen de un tablero de opciones de cacao (CCE - Cocoa ICE).

Extrae los datos en el siguiente formato JSON exacto:

{
  "contract_month": "MAY26",
  "underlying_price": 3036,
  "dte": 35,
  "expiration": "04/10/26",
  "volatility_calls": 42.01,
  "volatility_puts": 41.56,
  "interest_rate": 3.68,
  "strikes": [
    {"strike": 1500, "call_premium": 1555, "call_delta": 98.32, "put_premium": 1, "put_delta": -0.34},
    {"strike": 1550, "call_premium": 1505, "call_delta": 98.29, "put_premium": 1, "put_delta": -0.36}
  ]
}

Reglas:
- Extrae TODOS los strikes visibles en la imagen
- call_premium y put_premium son las columnas de precio (primera columna numérica de cada lado)
- call_delta y put_delta son las columnas de delta (segunda columna numérica de cada lado)
- Los deltas de puts son negativos
- UndPr = underlying_price, DTE = days to expiration, VOL = volatility, IR = interest rate
- Responde SOLO con el JSON, sin texto adicional ni markdown"""

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=8192,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": b64,
                    },
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    text = response.content[0].text.strip()
    # Limpiar si viene con ```json
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]

    return json.loads(text)
