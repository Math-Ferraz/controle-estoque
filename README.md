# Controle de Estoque - Locadora (login + Render)

## Pastas
```
app.py  requirements.txt  render.yaml  _gitignore (renomeie para .gitignore)
templates/index.html
static/style.css  static/script.js
data/   <- criada sozinha (banco, backups, chave). NÃO vai para o GitHub.
```
Apague os antigos `index.html`, `script.js` e `style.css` soltos na raiz.

## ATENÇÃO: dados no Render gratuito são apagados
No plano gratuito o disco é apagado a cada reinício, atualização ou quando o serviço "dorme" (15 min sem uso; ele leva cerca de 1 minuto para acordar). Por isso:
- **Teste** só com dados fictícios. A tela mostra um aviso amarelo de "Modo de teste".
- **Uso real** exige plano pago + disco permanente (ver abaixo). Confira preços atuais em render.com/pricing.

## Publicar no Render (teste)
1. Crie um repositório **privado** no GitHub e envie os arquivos (sem a pasta `data/`).
2. No Render: **New > Blueprint** e escolha o repositório (usa o `render.yaml`).
   Ou **New > Web Service** com: Build `pip install -r requirements.txt`, Start `gunicorn app:app --workers 1 --threads 8 --timeout 60 --bind 0.0.0.0:$PORT`, e variáveis `PYTHON_VERSION=3.12.3`, `SECRET_KEY` (texto longo aleatório) e `SETUP_TOKEN` (outro texto aleatório).
3. Depois do deploy, abra o endereço `https://...onrender.com`.
4. No primeiro acesso a tela pede o **Código de instalação**: é o valor de `SETUP_TOKEN` (Render > Environment). Crie o administrador.
5. O administrador cadastra as outras pessoas em **Usuários**.

## Uso real (dados permanentes)
1. Mude o serviço para um plano pago (ex.: Starter).
2. Em **Disks**, adicione um disco com mount path `/var/data`.
3. Em Environment, adicione `DATA_DIR=/var/data` e reinicie. O aviso de teste some.
Observação: com disco, cada atualização do sistema causa uma breve interrupção.

## Segurança embutida
- Login obrigatório; senha mínima de 10 caracteres; sessão de 12 h; cookie só por HTTPS.
- Sem cadastro aberto. O primeiro administrador exige o código de instalação.
- 5 erros de senha bloqueiam aquele usuário naquele IP por alguns minutos.
- Cabeçalhos de segurança, proteção contra envio de outro site e bloqueio para buscadores.
- Registro de alterações e de logins (Usuários > Registro de alterações).
- Mantenha o repositório privado. Os dados têm nomes e telefones de clientes (LGPD): dê acesso só a quem precisa e desative contas de quem sai.

## Backup
- Administrador: **Dados > Baixar cópia do banco**. Faça toda semana e guarde fora do Render.
- Todos: **Dados > Exportar backup** (JSON).
- Com disco, também há cópia diária em `data/backups/` (30 dias).

## Rodar no computador (opcional)
`python app.py` (ou `iniciar.bat`). Sem `SETUP_TOKEN`, o primeiro administrador só pode ser criado no próprio computador.