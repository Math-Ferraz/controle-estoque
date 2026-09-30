from contextlib import closing
from datetime import date
from pathlib import Path
import json
import sqlite3

from flask import Flask, jsonify, request, render_template

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "estoque.db"
BACKUP_DIR = BASE_DIR / "data" / "backups"
BACKUPS_MANTIDOS = 30

app = Flask(__name__)


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Bancos criados antes desta versão não têm a coluna de revisão.
        colunas = [c["name"] for c in conn.execute("PRAGMA table_info(app_state)")]
        if "rev" not in colunas:
            conn.execute("ALTER TABLE app_state ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
        conn.commit()


def backup_diario():
    """Copia o banco uma vez por dia, antes da primeira gravação do dia."""
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        destino = BACKUP_DIR / f"estoque-{date.today():%Y-%m-%d}.db"
        if destino.exists() or not DB_PATH.exists():
            return
        with closing(get_db()) as origem, closing(sqlite3.connect(destino)) as copia:
            origem.backup(copia)
        for antigo in sorted(BACKUP_DIR.glob("estoque-*.db"))[:-BACKUPS_MANTIDOS]:
            antigo.unlink()
    except Exception as e:  # o backup nunca deve impedir o salvamento
        app.logger.warning("Backup diário falhou: %s", e)


# Garante a tabela mesmo se o app for iniciado por outro comando (flask run, waitress...)
init_db()


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def get_state():
    with closing(get_db()) as conn:
        row = conn.execute("SELECT data, rev FROM app_state WHERE id = 1").fetchone()

    if not row:
        resp = jsonify(None)
        resp.headers["X-Rev"] = "0"
        return resp

    try:
        resp = jsonify(json.loads(row["data"]))
    except json.JSONDecodeError:
        return jsonify({"error": "Dados inválidos no banco."}), 500
    resp.headers["X-Rev"] = str(row["rev"])
    return resp


@app.post("/api/state")
def save_state():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Estado inválido."}), 400

    if not all(isinstance(data.get(k), list) for k in ("eq", "loc")):
        return jsonify({"error": "Estrutura de dados inválida."}), 400

    payload = json.dumps(data, ensure_ascii=False)
    rev_cliente = request.headers.get("X-Rev", type=int)

    backup_diario()

    with closing(get_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")  # trava para evitar duas gravações simultâneas
        row = conn.execute("SELECT rev FROM app_state WHERE id = 1").fetchone()
        atual = row["rev"] if row else 0

        # Se outra aba/janela salvou antes, a revisão não bate: recusa em vez de sobrescrever.
        if row and rev_cliente is not None and rev_cliente != atual:
            conn.rollback()
            return jsonify({"error": "Conflito: os dados mudaram em outra janela.", "rev": atual}), 409

        nova = atual + 1
        conn.execute("""
            INSERT INTO app_state (id, data, updated_at, rev)
            VALUES (1, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(id) DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP,
                rev = excluded.rev
        """, (payload, nova))
        conn.commit()

    return jsonify({"ok": True, "rev": nova})


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "database": str(DB_PATH)})


if __name__ == "__main__":
    # debug=False: o modo debug expõe um console de execução de código e reinicia o servidor sozinho.
    app.run(host="127.0.0.1", port=5000, debug=False)