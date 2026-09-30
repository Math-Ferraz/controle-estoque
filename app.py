from contextlib import closing
from datetime import date
from pathlib import Path
import json
import os
import sqlite3

from flask import Flask, jsonify, request, render_template, session
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "estoque.db"
BACKUP_DIR = BASE_DIR / "data" / "backups"
BACKUPS_MANTIDOS = 30

app = Flask(__name__)
# Chave secreta para assinar os cookies de sessão (em produção no Render, pode usar uma variável de ambiente)
app.secret_key = os.environ.get("SECRET_KEY", "chave-secreta-estoque-locadora-2026")


def get_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(get_db()) as conn:
        # Tabela de dados do aplicativo
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                rev INTEGER NOT NULL DEFAULT 0
            )
        """)
        
        # Tabela de usuários para autenticação
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def backup_diario():
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        destino = BACKUP_DIR / f"estoque-{date.today():%Y-%m-%d}.db"
        if destino.exists() or not DB_PATH.exists():
            return
        with closing(get_db()) as origem, closing(sqlite3.connect(destino)) as copia:
            origem.backup(copia)
        for antigo in sorted(BACKUP_DIR.glob("estoque-*.db"))[:-BACKUPS_MANTIDOS]:
            antigo.unlink()
    except Exception as e:
        app.logger.warning("Backup diário falhou: %s", e)


init_db()


# --- ROTAS DE AUTENTICAÇÃO ---

@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Usuário e senha são obrigatórios."}), 400

    if len(password) < 6:
        return jsonify({"error": "A senha deve ter pelo menos 6 caracteres."}), 400

    pwd_hash = generate_password_hash(password)

    try:
        with closing(get_db()) as conn:
            conn.execute(
                "INSERT INTO usuarios (username, password_hash) VALUES (?, ?)",
                (username, pwd_hash)
            )
            conn.commit()
        return jsonify({"ok": True, "message": "Usuário cadastrado com sucesso!"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Nome de usuário já existe."}), 400


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    with closing(get_db()) as conn:
        user = conn.execute("SELECT * FROM usuarios WHERE username = ?", (username,)).fetchone()

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Usuário ou senha inválidos."}), 401

    session["user_id"] = user["id"]
    session["username"] = user["username"]

    return jsonify({"ok": True, "username": user["username"]})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    if "user_id" in session:
        return jsonify({"logged_in": True, "username": session["username"]})
    return jsonify({"logged_in": False})


# --- ROTAS DA APLICAÇÃO ---

@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/state")
def get_state():
    if "user_id" not in session:
        return jsonify({"error": "Não autorizado."}), 401

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
    if "user_id" not in session:
        return jsonify({"error": "Não autorizado."}), 401

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "Estado inválido."}), 400

    if not all(isinstance(data.get(k), list) for k in ("eq", "loc")):
        return jsonify({"error": "Estrutura de dados inválida."}), 400

    payload = json.dumps(data, ensure_ascii=False)
    rev_cliente = request.headers.get("X-Rev", type=int)

    backup_diario()

    with closing(get_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT rev FROM app_state WHERE id = 1").fetchone()
        atual = row["rev"] if row else 0

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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)