"""CacaoQ — Sincronización Inventory MCP → tabla physical_inventory.

One-way: Google Sheet → DB. Las columnas del sheet varían en mayúsculas/acentos/
nombres, así que el mapeo es defensivo (heurístico sobre headers normalizados).
"""

import re
import unicodedata
from datetime import datetime
from typing import Any

from config import ESTADOS_INVENTARIO
from mcp_client import inventory as mcp
from db.models import upsert_inventory_by_external_id


# Mapeo defensivo: campo interno → posibles nombres en el sheet (normalizados).
_FIELD_HINTS = {
    "date": [
        "fecha", "fechacompra", "fechadecompra", "fechaentrada", "fechaingreso",
        "fechaorden", "date", "dia",
    ],
    "tonnes": [
        "toneladas", "ton", "tons", "tonelaje", "kg", "kilos", "cantidad",
        "cantidadporllegar", "cantidadtotal", "cantidadnetta", "qty", "peso",
    ],
    "price_cop_kg": [
        "preciocopkg", "preciokg", "preciocop", "preciopromedio",
        "precio", "preciounitario", "valorkg", "valorunitario", "cop",
    ],
    "supplier": [
        "proveedor", "supplier", "vendedor", "productor", "asociacion",
        "cooperativa", "procedencia",
    ],
    "region": ["region", "departamento", "lugar", "zona", "origen"],
    "status": ["estado", "status", "fase", "etapa"],
    "shipment_date": [
        "fechaembarque", "embarque", "fechashipment", "shipment",
        "fechaentrega", "fechallegada", "eta",
    ],
    "notes": ["notas", "observaciones", "comentarios", "notes", "obs", "licor"],
}


def _normalize_key(s: str) -> str:
    """Quita acentos, espacios y minúsculas: 'Fecha de Compra' → 'fechadecompra'."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-zA-Z0-9]", "", s).lower()
    return s


def _build_column_map(headers: list[str]) -> dict[str, str]:
    """Mapea {campo_interno: header_real_del_sheet} usando los hints."""
    normalized = {h: _normalize_key(h) for h in headers}
    out: dict[str, str] = {}
    for field, hints in _FIELD_HINTS.items():
        for hint in hints:
            for real_header, norm in normalized.items():
                if norm == hint or hint in norm:
                    out[field] = real_header
                    break
            if field in out:
                break
    return out


def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        if isinstance(v, str):
            # "12,500" o "12.500" o "12,500.00"
            s = v.strip().replace("$", "").replace("COP", "").strip()
            # Si tiene coma como decimal (estilo CO): "12,5" → "12.5"; "12.500,50" → "12500.50"
            if "," in s and "." in s:
                if s.rfind(",") > s.rfind("."):
                    s = s.replace(".", "").replace(",", ".")
                else:
                    s = s.replace(",", "")
            elif "," in s:
                if s.count(",") == 1 and len(s.split(",")[1]) <= 2:
                    s = s.replace(",", ".")
                else:
                    s = s.replace(",", "")
            return float(s)
        return float(v)
    except (ValueError, TypeError):
        return None


def _coerce_date(v: Any) -> str | None:
    """Acepta varios formatos y retorna ISO YYYY-MM-DD."""
    if v is None or v == "":
        return None
    if isinstance(v, (datetime,)):
        return v.date().isoformat()
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y", "%m/%d/%Y", "%m/%d/%y",
                "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _coerce_status(v: Any) -> str:
    if not v:
        return "bodega"
    s = _normalize_key(v)
    for valid in ESTADOS_INVENTARIO:
        if _normalize_key(valid) == s or s in _normalize_key(valid):
            return valid
    # Mapeos comunes que no caen en match exacto
    if "transit" in s:
        return "tránsito"
    if "puerto" in s or "port" in s:
        return "puerto"
    if "embarc" in s or "ship" in s:
        return "embarcado"
    if "entreg" in s or "deliver" in s:
        return "entregado"
    return "bodega"


def _row_external_id(worksheet: str, row_index: int) -> str:
    """ID estable para dedup. Usa worksheet + índice de fila."""
    return f"mcp:inventory:{worksheet}:{row_index}"


def _normalize_row(row: dict, colmap: dict[str, str]) -> dict | None:
    """Convierte una fila del sheet al schema interno. None si faltan date+tonnes."""
    def get(field: str) -> Any:
        col = colmap.get(field)
        return row.get(col) if col else None

    date_iso = _coerce_date(get("date"))
    tonnes = _coerce_float(get("tonnes"))
    price = _coerce_float(get("price_cop_kg"))

    # Solo date y tonnes son obligatorios. Si falta price, registramos 0
    # y dejamos marca en notas para que el usuario lo complete después.
    if not date_iso or tonnes is None or tonnes <= 0:
        return None

    notes_raw = get("notes")
    notes = str(notes_raw).strip() if notes_raw else None
    if price is None or price <= 0:
        price = 0.0
        marker = "[sin precio en sheet]"
        notes = f"{notes} {marker}".strip() if notes else marker

    return {
        "date": date_iso,
        "tonnes": tonnes,
        "price_cop_kg": price,
        "supplier": (str(get("supplier")).strip() or None) if get("supplier") else None,
        "region": (str(get("region")).strip() or None) if get("region") else None,
        "status": _coerce_status(get("status")),
        "shipment_date": _coerce_date(get("shipment_date")),
        "notes": notes,
    }


def sync_from_sheet(worksheet_name: str | None = None,
                    header_row: int | None = None,
                    limit: int | None = None) -> dict:
    """Lee la sheet del MCP y upsertea en physical_inventory.

    Args:
        worksheet_name: nombre de la hoja; None = default del MCP.
        header_row: fila de headers; None = autodetectar.
        limit: tope de filas a leer (None = todas). Útil para evitar timeouts.

    Returns dict con: ok, inserted, updated, skipped, errors[], colmap.
    """
    if not mcp.is_configured():
        return {"ok": False, "error": "INVENTORY_MCP_URL no configurado"}

    try:
        rows = mcp.read_inventory(
            worksheet_name=worksheet_name,
            header_row=header_row,
            limit=limit,
        )
    except Exception as e:
        return {"ok": False, "error": f"MCP error: {type(e).__name__}: {e}"}

    if not rows:
        return {"ok": False, "error": "Sheet vacía o sin filas legibles"}

    headers = list(rows[0].keys())
    colmap = _build_column_map(headers)

    required = ["date", "tonnes"]
    missing = [f for f in required if f not in colmap]
    if missing:
        return {
            "ok": False,
            "error": f"No se pudieron detectar columnas requeridas: {missing}",
            "headers_found": headers,
            "colmap": colmap,
        }

    worksheet_label = worksheet_name or "default"
    inserted = updated = skipped = 0
    no_price_count = 0
    errors: list[str] = []

    for idx, raw in enumerate(rows):
        try:
            norm = _normalize_row(raw, colmap)
            if not norm:
                skipped += 1
                continue
            if norm["price_cop_kg"] == 0.0:
                no_price_count += 1
            ext_id = _row_external_id(worksheet_label, idx)
            _, was_insert = upsert_inventory_by_external_id(
                external_id=ext_id,
                **norm,
            )
            if was_insert:
                inserted += 1
            else:
                updated += 1
        except Exception as e:
            errors.append(f"Fila {idx}: {type(e).__name__}: {e}")

    return {
        "ok": True,
        "worksheet": worksheet_label,
        "rows_read": len(rows),
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "no_price_count": no_price_count,
        "price_column_detected": "price_cop_kg" in colmap,
        "errors": errors[:5],
        "colmap": colmap,
    }


def health_check() -> dict:
    return mcp.ping()
