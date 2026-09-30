from contextlib import closing
from datetime import date
from functools import wraps
from pathlib import Path
import json
import os
import secrets
import socket
import sqlite3
import time

from urllib.parse import urlparse

from flask import Flask, Response, jsonify, request, render_template, session, g
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent
# DATA_DIR: pasta dos dados. No Render com disco permanente, use DATA_DIR=/var/data
DATA_DIR = Path(os.environ["DATA_DIR"]) if os.environ.get("DATA_DIR") else BASE_DIR / "data"
DB_PATH = DATA_DIR / "estoque.db"
BACKUP_DIR = DATA_DIR / "backups"
KEY_PATH = DATA_DIR / "secret.key"
BACKUPS_MANTIDOS = 30
SENHA_MIN = 10

EM_NUVEM = bool(os.environ.get("RENDER")) or os.environ.get("TRUST_PROXY") == "1"  # atrás de proxy (Render)
SO_HTTPS = EM_NUVEM or os.environ.get("COOKIE_SECURE") == "1"
SETUP_TOKEN = os.environ.get("SETUP_TOKEN", "")
# No Render gratuito o disco é apagado a cada reinício: avisamos na tela.
TESTE_TEMPORARIO = bool(os.environ.get("RENDER")) and not os.environ.get("DATA_DIR")

MAX_FALHAS, JANELA_FALHAS = 5, 600   # por usuário+IP: 5 erros em 10 min bloqueiam o login
MAX_FALHAS_IP = 20                   # por IP (qualquer usuário)

app = Flask(__name__)
if EM_NUVEM:  # enxerga o IP e o https reais do visitante, não os do proxy
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=SO_HTTPS,
    PERMANENT_SESSION_LIFETIME=12 * 3600,
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
)


def chave_secreta():
    """Chave que assina o cookie de login. Gerada uma vez e guardada em data/secret.key (nunca no código)."""
    if os.environ.get("SECRET_KEY"):
        return os.environ["SECRET_KEY"]
    KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not KEY_PATH.exists():
        KEY_PATH.write_text(secrets.token_hex(32))
    return KEY_PATH.read_text().strip()


app.secret_key = chave_secreta()


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
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                rev INTEGER NOT NULL DEFAULT 0
            )""")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS auditoria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                quando TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                usuario TEXT NOT NULL,
                acao TEXT NOT NULL
            )""")
        # Migrações de bancos criados em versões anteriores
        cols = {c["name"] for c in conn.execute("PRAGMA table_info(app_state)")}
        if "rev" not in cols:
            conn.execute("ALTER TABLE app_state ADD COLUMN rev INTEGER NOT NULL DEFAULT 0")
        cols = {c["name"] for c in conn.execute("PRAGMA table_info(usuarios)")}
        if "is_admin" not in cols:
            conn.execute("ALTER TABLE usuarios ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        if "ativo" not in cols:
            conn.execute("ALTER TABLE usuarios ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1")
        # Se já existem usuários mas nenhum administrador, o mais antigo vira administrador.
        if conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] and \
           not conn.execute("SELECT 1 FROM usuarios WHERE is_admin = 1").fetchone():
            conn.execute("UPDATE usuarios SET is_admin = 1 WHERE id = (SELECT MIN(id) FROM usuarios)")
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
    except Exception as e:  # o backup nunca deve impedir o salvamento
        app.logger.warning("Backup diário falhou: %s", e)


init_db()


# ---------------- autenticação ----------------

def usuario_atual():
    uid = session.get("user_id")
    if not uid:
        return None
    with closing(get_db()) as conn:
        u = conn.execute("SELECT id, username, is_admin, ativo FROM usuarios WHERE id = ?", (uid,)).fetchone()
    return u if u and u["ativo"] else None


def login_required(f):
    @wraps(f)
    def w(*a, **k):
        u = usuario_atual()
        if not u:
            session.clear()
            return jsonify({"error": "Não autorizado."}), 401
        g.user = u
        return f(*a, **k)
    return w


def admin_required(f):
    @wraps(f)
    @login_required
    def w(*a, **k):
        if not g.user["is_admin"]:
            return jsonify({"error": "Apenas administradores."}), 403
        return f(*a, **k)
    return w


FALHAS = {}


def _chave(username):
    return (request.remote_addr, username.lower())


def _n_falhas(chave):
    agora = time.time()
    FALHAS[chave] = [t for t in FALHAS.get(chave, []) if agora - t < JANELA_FALHAS]
    return len(FALHAS[chave])


def _bloqueado(chave):
    return _n_falhas(chave) >= MAX_FALHAS or _n_falhas(("ip", request.remote_addr)) >= MAX_FALHAS_IP


def _falhou(chave, username):
    FALHAS.setdefault(chave, []).append(time.time())
    FALHAS.setdefault(("ip", request.remote_addr), []).append(time.time())
    if _n_falhas(chave) == MAX_FALHAS:
        registrar_auditoria("(sistema)", [f'Login bloqueado após {MAX_FALHAS} tentativas erradas para "{username[:40]}" (IP {request.remote_addr})'])


@app.before_request
def checar_origem():
    """Recusa requisições de escrita vindas de outro site (defesa extra contra CSRF)."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origem = request.headers.get("Origin")
        if origem and urlparse(origem).netloc != request.host:
            return jsonify({"error": "Origem não permitida."}), 403


@app.after_request
def cabecalhos(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["X-Robots-Tag"] = "noindex, nofollow"
    resp.headers["Content-Security-Policy"] = ("default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                                               "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    if SO_HTTPS:
        resp.headers["Strict-Transport-Security"] = "max-age=31536000"
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/robots.txt")
def robots():
    return Response("User-agent: *\nDisallow: /\n", mimetype="text/plain")


def _dados_credenciais():
    d = request.get_json(silent=True) or {}
    return (d.get("username") or "").strip(), d.get("password") or ""


def _validar_senha(s):
    return None if len(s) >= SENHA_MIN else f"A senha deve ter pelo menos {SENHA_MIN} caracteres."


def _logar(user_id, username):
    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username


@app.get("/api/me")
def me():
    u = usuario_atual()
    if u:
        return jsonify({"logged_in": True, "username": u["username"], "is_admin": bool(u["is_admin"]),
                        "teste_temporario": TESTE_TEMPORARIO})
    with closing(get_db()) as conn:
        vazio = conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] == 0
    return jsonify({"logged_in": False, "precisa_admin": vazio, "precisa_token": bool(SETUP_TOKEN),
                    "setup_bloqueado": vazio and EM_NUVEM and not SETUP_TOKEN})


@app.post("/api/setup")
def setup():
    """Cria o primeiro administrador. Só funciona enquanto não existir nenhum usuário."""
    username, password = _dados_credenciais()
    d = request.get_json(silent=True) or {}
    chave = ("setup", request.remote_addr)
    if _n_falhas(chave) >= MAX_FALHAS:
        return jsonify({"error": "Muitas tentativas. Aguarde alguns minutos."}), 429
    if SETUP_TOKEN:
        liberado = secrets.compare_digest(str(d.get("token") or ""), SETUP_TOKEN)
    else:  # sem código configurado, só é permitido no próprio computador (uso local)
        liberado = (not EM_NUVEM) and request.remote_addr in ("127.0.0.1", "::1")
    if not liberado:
        FALHAS.setdefault(chave, []).append(time.time())
        return jsonify({"error": "Código de instalação inválido ou não configurado no servidor."}), 403
    if not username:
        return jsonify({"error": "Informe o nome de usuário."}), 400
    erro = _validar_senha(password)
    if erro:
        return jsonify({"error": erro}), 400
    with closing(get_db()) as conn:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]:
            conn.rollback()
            return jsonify({"error": "O sistema já foi configurado."}), 403
        cur = conn.execute("INSERT INTO usuarios (username, password_hash, is_admin) VALUES (?, ?, 1)",
                           (username, generate_password_hash(password)))
        conn.commit()
        uid = cur.lastrowid
    registrar_auditoria(username, ["Criou a conta de administrador (primeiro acesso)"])
    _logar(uid, username)
    return jsonify({"ok": True})


@app.post("/api/login")
def login():
    username, password = _dados_credenciais()
    chave = _chave(username)
    if _bloqueado(chave):
        return jsonify({"error": "Muitas tentativas. Aguarde alguns minutos e tente de novo."}), 429
    with closing(get_db()) as conn:
        u = conn.execute("SELECT * FROM usuarios WHERE username = ?", (username,)).fetchone()
    if not u or not u["ativo"] or not check_password_hash(u["password_hash"], password):
        _falhou(chave, username)
        return jsonify({"error": "Usuário ou senha inválidos."}), 401
    FALHAS.pop(chave, None)
    _logar(u["id"], u["username"])
    registrar_auditoria(u["username"], [f"Entrou no sistema (IP {request.remote_addr})"])
    return jsonify({"ok": True})


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.post("/api/me/senha")
@login_required
def trocar_minha_senha():
    d = request.get_json(silent=True) or {}
    erro = _validar_senha(d.get("nova") or "")
    if erro:
        return jsonify({"error": erro}), 400
    with closing(get_db()) as conn:
        u = conn.execute("SELECT password_hash FROM usuarios WHERE id = ?", (g.user["id"],)).fetchone()
        if not check_password_hash(u["password_hash"], d.get("atual") or ""):
            return jsonify({"error": "A senha atual está incorreta."}), 400
        conn.execute("UPDATE usuarios SET password_hash = ? WHERE id = ?",
                     (generate_password_hash(d["nova"]), g.user["id"]))
        conn.commit()
    return jsonify({"ok": True})


# ---------------- administração ----------------

@app.get("/api/usuarios")
@admin_required
def listar_usuarios():
    with closing(get_db()) as conn:
        rows = conn.execute("SELECT id, username, is_admin, ativo, created_at FROM usuarios ORDER BY username").fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/usuarios")
@admin_required
def criar_usuario():
    d = request.get_json(silent=True) or {}
    username = (d.get("username") or "").strip()
    if not username:
        return jsonify({"error": "Informe o nome de usuário."}), 400
    erro = _validar_senha(d.get("password") or "")
    if erro:
        return jsonify({"error": erro}), 400
    try:
        with closing(get_db()) as conn:
            conn.execute("INSERT INTO usuarios (username, password_hash, is_admin) VALUES (?, ?, ?)",
                         (username, generate_password_hash(d["password"]), 1 if d.get("is_admin") else 0))
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe um usuário com esse nome."}), 400
    registrar_auditoria(g.user["username"], [f'Cadastrou o usuário "{username}"'])
    return jsonify({"ok": True})


@app.post("/api/usuarios/<int:uid>/senha")
@admin_required
def redefinir_senha(uid):
    d = request.get_json(silent=True) or {}
    erro = _validar_senha(d.get("senha") or "")
    if erro:
        return jsonify({"error": erro}), 400
    with closing(get_db()) as conn:
        u = conn.execute("SELECT username FROM usuarios WHERE id = ?", (uid,)).fetchone()
        if not u:
            return jsonify({"error": "Usuário não encontrado."}), 404
        conn.execute("UPDATE usuarios SET password_hash = ? WHERE id = ?", (generate_password_hash(d["senha"]), uid))
        conn.commit()
    registrar_auditoria(g.user["username"], [f'Redefiniu a senha de "{u["username"]}"'])
    return jsonify({"ok": True})


@app.post("/api/usuarios/<int:uid>/ativo")
@admin_required
def ativar_usuario(uid):
    ativo = 1 if (request.get_json(silent=True) or {}).get("ativo") else 0
    with closing(get_db()) as conn:
        u = conn.execute("SELECT username, is_admin FROM usuarios WHERE id = ?", (uid,)).fetchone()
        if not u:
            return jsonify({"error": "Usuário não encontrado."}), 404
        if not ativo:
            if uid == g.user["id"]:
                return jsonify({"error": "Você não pode desativar a própria conta."}), 400
            outros = conn.execute("SELECT COUNT(*) FROM usuarios WHERE is_admin = 1 AND ativo = 1 AND id != ?", (uid,)).fetchone()[0]
            if u["is_admin"] and not outros:
                return jsonify({"error": "É preciso manter ao menos um administrador ativo."}), 400
        conn.execute("UPDATE usuarios SET ativo = ? WHERE id = ?", (ativo, uid))
        conn.commit()
    registrar_auditoria(g.user["username"], [f'{"Reativou" if ativo else "Desativou"} o usuário "{u["username"]}"'])
    return jsonify({"ok": True})


@app.get("/api/backup/db")
@admin_required
def baixar_banco():
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    try:
        with closing(get_db()) as origem, closing(sqlite3.connect(tmp)) as copia:
            origem.backup(copia)
        conteudo = Path(tmp).read_bytes()
    finally:
        os.unlink(tmp)
    registrar_auditoria(g.user["username"], ["Baixou uma cópia completa do banco"])
    return Response(conteudo, mimetype="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="estoque-{date.today():%Y-%m-%d}.db"'})


@app.get("/api/auditoria")
@admin_required
def listar_auditoria():
    with closing(get_db()) as conn:
        rows = conn.execute("SELECT quando, usuario, acao FROM auditoria ORDER BY id DESC LIMIT 300").fetchall()
    return jsonify([dict(r) for r in rows])


def registrar_auditoria(usuario, acoes, conn=None):
    if not acoes:
        return
    if conn is not None:
        conn.executemany("INSERT INTO auditoria (usuario, acao) VALUES (?, ?)", [(usuario, a) for a in acoes])
        return
    with closing(get_db()) as c:
        c.executemany("INSERT INTO auditoria (usuario, acao) VALUES (?, ?)", [(usuario, a) for a in acoes])
        c.commit()


def _fd(s):
    return "/".join(reversed(str(s).split("-"))) if s else ""


def _por_id(lista):
    return {i.get("id"): i for i in lista if isinstance(i, dict)}


def descrever_mudancas(old, new):
    """Compara o estado antigo e o novo e devolve frases legíveis (quem fez o quê fica no registro)."""
    out = []
    nome = lambda st, i: next((e.get("nome", "?") for e in st.get("eq", []) if isinstance(e, dict) and e.get("id") == i), "?")

    eo, en = _por_id(old.get("eq", [])), _por_id(new.get("eq", []))
    for i, e in en.items():
        if i not in eo:
            out.append(f'Cadastrou equipamento "{e.get("nome")}" ({e.get("total")} un.)')
        elif e != eo[i]:
            if e.get("total") != eo[i].get("total"):
                out.append(f'Alterou o total de "{e.get("nome")}": {eo[i].get("total")} → {e.get("total")}')
            else:
                out.append(f'Alterou equipamento "{e.get("nome")}"')
    out += [f'Removeu equipamento "{e.get("nome")}"' for i, e in eo.items() if i not in en]

    lo, ln = _por_id(old.get("loc", [])), _por_id(new.get("loc", []))
    dl = lambda l, st: f'{l.get("cliente")} - {l.get("qtd")}x {nome(st, l.get("eq"))} ({_fd(l.get("ini"))} a {_fd(l.get("fim"))})'
    for i, l in ln.items():
        if i not in lo:
            out.append("Registrou locação: " + dl(l, new))
        elif l != lo[i]:
            a = lo[i]
            if l.get("conf") and not a.get("conf"):
                tipo = str((l["conf"] or {}).get("tipo", "")).lower()
                out.append(f"Confirmou {tipo} de " + dl(l, new))
            elif a.get("conf") and not l.get("conf"):
                out.append("Desfez a confirmação de " + dl(l, new))
            elif l.get("fim") != a.get("fim") and all(l.get(k) == a.get(k) for k in ("eq", "cliente", "tel", "qtd", "ini")):
                out.append(f'Renovou: {l.get("cliente")} ({nome(new, l.get("eq"))}) de {_fd(a.get("fim"))} para {_fd(l.get("fim"))}')
            else:
                out.append("Editou locação: " + dl(l, new))
    out += ["Excluiu locação: " + dl(l, old) for i, l in lo.items() if i not in ln]

    mo, mn = _por_id(old.get("man", [])), _por_id(new.get("man", []))
    dm = lambda m, st: f'{m.get("qtd")}x {nome(st, m.get("eq"))}'
    for i, m in mn.items():
        if i not in mo:
            out.append(f'Registrou manutenção: {dm(m, new)} desde {_fd(m.get("ini"))}')
        elif m != mo[i]:
            out.append(f'Atualizou manutenção: {dm(m, new)}' + (f' (retorna em {_fd(m.get("ret"))})' if m.get("ret") else ""))
    out += [f"Excluiu manutenção: {dm(m, old)}" for i, m in mo.items() if i not in mn]

    if old.get("cfg") and (old["cfg"].get("mesmoDia") != (new.get("cfg") or {}).get("mesmoDia")):
        out.append("Alterou a regra de devolução no mesmo dia")
    if len(out) > 25:
        out = out[:25] + [f"… e mais {len(out) - 25} alterações"]
    return out


# ---------------- aplicação ----------------

@app.get("/")
def index():
    v = int(max((BASE_DIR / "static" / n).stat().st_mtime for n in ("script.js", "style.css")))
    return render_template("index.html", v=v)


@app.get("/api/state")
@login_required
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


@app.get("/api/rev")
@login_required
def get_rev():
    with closing(get_db()) as conn:
        row = conn.execute("SELECT rev FROM app_state WHERE id = 1").fetchone()
    resp = jsonify({"rev": row["rev"] if row else 0})
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.post("/api/state")
@login_required
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
        conn.execute("BEGIN IMMEDIATE")  # uma gravação por vez
        row = conn.execute("SELECT rev, data FROM app_state WHERE id = 1").fetchone()
        atual = row["rev"] if row else 0
        if row and rev_cliente is not None and rev_cliente != atual:
            conn.rollback()
            return jsonify({"error": "Conflito: os dados mudaram em outra janela.", "rev": atual}), 409
        try:
            antigo = json.loads(row["data"]) if row else {}
        except json.JSONDecodeError:
            antigo = {}
        nova = atual + 1
        conn.execute("""
            INSERT INTO app_state (id, data, updated_at, rev) VALUES (1, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP, rev = excluded.rev
        """, (payload, nova))
        registrar_auditoria(g.user["username"], descrever_mudancas(antigo, data), conn)
        conn.commit()
    return jsonify({"ok": True, "rev": nova})


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


def ip_local():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    host = os.environ.get("ESTOQUE_HOST", "0.0.0.0")
    port = int(os.environ.get("ESTOQUE_PORT", os.environ.get("PORT", "5000")))
    print("=" * 60)
    print(" Controle de Estoque em execucao. Nao feche esta janela.")
    print(f" Neste computador:        http://127.0.0.1:{port}")
    if host != "127.0.0.1":
        print(f" Outros computadores:     http://{ip_local()}:{port}")
    print("=" * 60)
    try:
        from waitress import serve
    except ImportError:
        app.run(host=host, port=port, debug=False, threaded=True)
    else:
        serve(app, host=host, port=port, threads=8)