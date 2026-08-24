# CacaoQ dentro de este repo

`cacaoq/` es el motor de inteligencia de mercado y gestión de riesgo: precios de
futuros, cadena de opciones, estados de StoneX, cobertura y P&L. Vive aquí para
que el código tenga un solo lugar de verdad, **pero se despliega aparte**.

## Por qué no va en el mismo despliegue

Streamlit es un servidor de larga vida con WebSockets y estado en memoria.
Vercel corre funciones serverless: petición entra, respuesta sale, el proceso
muere. No hay forma soportada de ejecutar Streamlit ahí.

Lo que sí corre en Vercel es Python. La línea divisoria no es Python sí o no —
es Streamlit. Por eso el camino para llegar a un despliegue único es traer las
pantallas al CRM como páginas Next y dejar el motor como funciones Python en el
mismo proyecto; el 73 % del Python (engine, parsers, clientes MCP) se reusa.

## Correrlo en local

```bash
cd cacaoq
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # y llenarlo
streamlit run app.py
```

## Lo que NO está versionado

`.env` (secretos), `data_db/` (la base SQLite local) y `statements/*.pdf` (los
estados de cuenta de StoneX). Están en `.gitignore` a propósito: son datos
financieros y credenciales, no código.
