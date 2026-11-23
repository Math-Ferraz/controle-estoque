# Controle de Estoque para Locadora

Sistema web para controlar o estoque de equipamentos de uma locadora e verificar a disponibilidade em qualquer período, considerando devoluções, renovações e manutenções.

> **Projeto de portfólio com dados fictícios.** Para uso com dados reais, é recomendado um plano pago do Render com disco permanente (veja a seção [Deploy no Render](#deploy-no-render)).

## Funcionalidades

- **Consulta de disponibilidade:** informe equipamento, quantidade e período e veja o saldo dia a dia, além das locações e devoluções previstas.
- **Locações:** cadastro de pedidos com um ou mais itens, observação com cor de destaque, edição, renovação e exclusão.
- **Confirmações:** entrega, devolução e retirada, com data real.
- **Movimentação do dia:** saídas, devoluções, retiradas e pedidos em atraso.
- **Manutenção:** registro de equipamentos fora de uso, com previsão de retorno, que são descontados do estoque disponível.
- **Equipamentos e categorias:** cadastro, edição de nome e quantidade total e categorias personalizadas.
- **Histórico:** devoluções e retiradas confirmadas, com filtros por tipo, equipamento, período e cliente.
- **Dados:** exportação de backup em JSON, download do banco (administrador) e importação de planilhas CSV.
- **Usuários:** perfis de administrador e usuário, com registro de alterações e de logins.
- **Interface:** tema claro e escuro.

## Segurança

- Login obrigatório, com senhas armazenadas como hash e mínimo de 10 caracteres.
- Bloqueio temporário após 5 erros de senha para o mesmo usuário e IP, e limite também por IP.
- Sessão de 12 horas, cookie `HttpOnly` e `SameSite`, e cookie seguro quando em HTTPS.
- Cabeçalhos HTTP de segurança, como Content-Security-Policy e X-Frame-Options.
- Recusa de requisições de escrita vindas de outro site (proteção contra CSRF).
- O primeiro administrador exige um código de instalação (`SETUP_TOKEN`) quando publicado.

## Decisões técnicas

- **Back-end em Flask**, com rotas JSON em `/api/`.
- **Front-end em HTML, CSS e JavaScript puro**, sem framework.
- **SQLite**, em uma tabela `app_state` que guarda o estado como JSON, além de tabelas para usuários e auditoria.
- **Controle de concorrência:** cada gravação envia a revisão atual (`rev`). Se os dados mudaram em outra janela, o servidor responde com `409` e a tela é atualizada.
- **Auditoria:** as alterações são comparadas com o estado anterior e registradas em frases legíveis, como "Confirmou devolução de ...".
- **Configuração por variáveis de ambiente:** `SECRET_KEY`, `SETUP_TOKEN` e `DATA_DIR`.

## Limitações conhecidas

- O cálculo de disponibilidade é feito no navegador, e o servidor valida apenas a estrutura dos dados.
- Como o estado inteiro fica em um único registro JSON, o sistema é adequado para uso pequeno. Uma evolução natural seria separar equipamentos, locações e manutenções em tabelas e mover as regras de negócio para o back-end.

## Tecnologias

Python, Flask, SQLite, Gunicorn, Waitress (Windows), HTML, CSS, JavaScript.

## Estrutura

```
app.py
requirements.txt
render.yaml
templates/index.html
static/style.css
static/script.js
```

A pasta `data/` é criada automaticamente e contém o banco, os backups e a chave. Ela não deve ser versionada.

## Como rodar localmente

Pré-requisito: Python 3.12 ou superior.

```bash
git clone <url-do-repositorio>
cd <pasta-do-projeto>
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate # Linux/macOS
pip install -r requirements.txt
python app.py
```

Acesse `http://127.0.0.1:5000`. Sem `SETUP_TOKEN` configurado, o primeiro administrador só pode ser criado no próprio computador.

## Deploy no Render

1. Crie um repositório **privado** no GitHub e envie os arquivos, sem a pasta `data/`.
2. No Render, use **New > Blueprint** e escolha o repositório, que usa o `render.yaml`.
   Ou use **New > Web Service** com:
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `gunicorn app:app --workers 1 --threads 8 --timeout 60 --bind 0.0.0.0:$PORT`
   - **Variáveis:** `PYTHON_VERSION=3.12.3`, `SECRET_KEY` e `SETUP_TOKEN` (textos longos e aleatórios).
3. Após o deploy, abra o endereço gerado e informe o `SETUP_TOKEN` para criar o administrador.

**Atenção:** no plano gratuito, o disco é apagado a cada reinício ou atualização, e o serviço "dorme" após 15 minutos sem uso. Por isso, use apenas dados fictícios nessa modalidade.

Para dados reais, é preciso um plano pago com disco persistente: adicione um disco com mount path `/var/data` e a variável `DATA_DIR=/var/data`. Confira os preços em render.com/pricing.

## Backup

- **Administrador:** Dados > Baixar cópia do banco.
- **Todos os usuários:** Dados > Exportar backup (JSON).
- Com disco persistente, também há cópias diárias em `data/backups/`, mantendo as últimas 30.


## Screenshots

<img width="1904" height="994" alt="Captura de tela 2026-11-23 163929" src="https://github.com/user-attachments/assets/7c26e989-6ad6-4636-a01f-a8b0d0c5d83e" />
<img width="1906" height="994" alt="Captura de tela 2026-11-23 163947" src="https://github.com/user-attachments/assets/9afca0d6-067d-474a-a682-7181462e4b4a" />
<img width="1903" height="996" alt="Captura de tela 2026-11-23 163941" src="https://github.com/user-attachments/assets/a0d2ef6e-c3e1-4ad5-8c3a-c76e1fa7737f" />

## Programa criado por Vibe coding
