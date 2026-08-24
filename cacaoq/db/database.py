"""CacaoQ — Inicialización y conexión a SQLite (local o Turso remoto)."""

import sqlite3
from config import DB_PATH, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN


class TursoConnection:
    """Wrapper sobre libsql_client que imita la interfaz de sqlite3.Connection."""

    def __init__(self, client):
        self._client = client
        self.row_factory = None

    def execute(self, sql, params=None):
        args = list(params) if params else []
        result = self._client.execute(sql, args)
        return TursoCursor(result, self.row_factory)

    def executescript(self, script):
        statements = [s.strip() for s in script.split(";") if s.strip() and not s.strip().startswith("--")]
        self._client.batch(statements)

    def cursor(self):
        return self

    def commit(self):
        pass  # Turso auto-commits

    def close(self):
        self._client.close()

    def sync(self):
        pass


class TursoCursor:
    """Wrapper sobre el resultado de libsql_client que imita sqlite3.Cursor."""

    def __init__(self, result, row_factory):
        self._result = result
        self._row_factory = row_factory
        self.lastrowid = getattr(result, "last_insert_rowid", None)

    def fetchall(self):
        if self._row_factory == sqlite3.Row:
            cols = [c for c in self._result.columns]
            return [_DictRow(dict(zip(cols, row))) for row in self._result.rows]
        return self._result.rows

    def fetchone(self):
        rows = self.fetchall()
        return rows[0] if rows else None


class _DictRow:
    """Imita sqlite3.Row: acceso por nombre y por índice, compatible con dict()."""

    def __init__(self, data: dict):
        self._data = data

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._data[key]
        return list(self._data.values())[key]

    def keys(self):
        return self._data.keys()


def _dict_from_row(row):
    """Convierte un _DictRow o sqlite3.Row a dict."""
    return dict(row._data) if isinstance(row, _DictRow) else dict(row)


def get_connection():
    """Retorna conexión a la base de datos.

    Si TURSO_DATABASE_URL está configurado, conecta a Turso (HTTP remoto).
    Si no, usa SQLite local como fallback para desarrollo.
    """
    if TURSO_DATABASE_URL:
        import libsql_client
        url = TURSO_DATABASE_URL
        # libsql_client necesita https://, no libsql://
        if url.startswith("libsql://"):
            url = url.replace("libsql://", "https://", 1)
        client = libsql_client.create_client_sync(
            url=url,
            auth_token=TURSO_AUTH_TOKEN,
        )
        conn = TursoConnection(client)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn


def init_db():
    """Crea todas las tablas si no existen."""
    conn = get_connection()

    # Para Turso, ejecutamos cada statement por separado
    statements = [
        """CREATE TABLE IF NOT EXISTS physical_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            tonnes REAL NOT NULL,
            price_cop_kg REAL NOT NULL,
            supplier TEXT,
            region TEXT,
            status TEXT NOT NULL DEFAULT 'bodega',
            shipment_date TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS broker_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            statement_date TEXT NOT NULL,
            account TEXT NOT NULL,
            trade_date TEXT,
            card TEXT,
            long_qty INTEGER DEFAULT 0,
            short_qty INTEGER DEFAULT 0,
            option_type TEXT,
            contract_month TEXT,
            exchange TEXT DEFAULT 'ICE COCOA',
            strike REAL,
            settle_price REAL,
            market_value REAL,
            dr_cr TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS account_balance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            statement_date TEXT NOT NULL,
            account TEXT NOT NULL,
            beginning_balance REAL,
            ending_balance REAL,
            total_equity REAL,
            long_option_value REAL,
            short_option_value REAL,
            net_option_value REAL,
            net_liquidating_value REAL,
            prior_net_liquidating_value REAL,
            market_variance REAL,
            initial_margin REAL,
            maintenance_margin REAL,
            excess_equity REAL,
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS processed_statements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            statement_date TEXT NOT NULL,
            account TEXT NOT NULL,
            file_hash TEXT UNIQUE,
            num_positions INTEGER,
            processed_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS market_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            ticker TEXT NOT NULL,
            close_price REAL,
            open_price REAL,
            high REAL,
            low REAL,
            volume REAL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(date, ticker)
        )""",
        """CREATE TABLE IF NOT EXISTS trm_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            trm REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS risk_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            total_physical_tonnes REAL,
            covered_tonnes REAL,
            coverage_pct REAL,
            cacao_price_usd REAL,
            trm REAL,
            net_liquidating_value REAL,
            unrealized_pnl_physical REAL,
            unrealized_pnl_hedge REAL,
            collar_floor REAL,
            collar_cap REAL,
            created_at TEXT DEFAULT (datetime('now'))
        )""",
        """CREATE TABLE IF NOT EXISTS local_sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            inventory_id INTEGER,
            tonnes REAL NOT NULL,
            price_cop_kg REAL NOT NULL,
            buyer TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (inventory_id) REFERENCES physical_inventory(id)
        )""",
        """CREATE TABLE IF NOT EXISTS options_board (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            contract_month TEXT NOT NULL,
            underlying_price REAL,
            dte INTEGER,
            expiration TEXT,
            volatility_calls REAL,
            volatility_puts REAL,
            interest_rate REAL,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(date, contract_month)
        )""",
        """CREATE TABLE IF NOT EXISTS options_chain (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL,
            strike REAL NOT NULL,
            call_premium REAL,
            call_delta REAL,
            put_premium REAL,
            put_delta REAL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (board_id) REFERENCES options_board(id),
            UNIQUE(board_id, strike)
        )""",
        """CREATE TABLE IF NOT EXISTS broker_pnl (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            statement_date TEXT NOT NULL,
            account TEXT NOT NULL,
            realized_pnl_mtd REAL,
            realized_pnl_ytd REAL,
            currency TEXT DEFAULT 'USD',
            created_at TEXT DEFAULT (datetime('now'))
        )""",
    ]

    for stmt in statements:
        conn.execute(stmt)

    # --- Migraciones idempotentes (ADD COLUMN si no existe) ---
    _migrations = [
        "ALTER TABLE physical_inventory ADD COLUMN external_id TEXT",
    ]
    for mig in _migrations:
        try:
            conn.execute(mig)
        except Exception:
            # La columna ya existe — SQLite no soporta IF NOT EXISTS en ADD COLUMN
            pass

    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada")
