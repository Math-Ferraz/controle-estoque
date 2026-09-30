# Controle de Estoque - Locadora

Primeira etapa da migração do HTML original para um sistema local com banco de dados.

## O que esta versão faz

- Mantém as telas e regras de estoque do HTML original.
- Troca o `localStorage` por SQLite.
- O navegador conversa com o backend Flask em `/api/state`.
- O banco é criado automaticamente em `data/estoque.db`.
- Backup JSON continua disponível.
- Exportação de CSV funciona diretamente no navegador.

## Como iniciar no Windows

1. Instale Python 3.12 ou mais recente.
2. Abra o PowerShell nesta pasta.
3. Crie o ambiente virtual:

```powershell
python -m venv .venv
```

4. Ative:

```powershell
.venv\Scripts\Activate.ps1
```

5. Instale:

```powershell
pip install -r requirements.txt
```

6. Inicie:

```powershell
python app.py
```

7. Abra no navegador:

http://127.0.0.1:5000

Também existe `iniciar.bat` para facilitar a abertura depois que o ambiente virtual estiver configurado.

## Observação importante

Nesta primeira etapa, o banco guarda o estado completo do aplicativo em JSON dentro do SQLite. Isso foi proposital para preservar o funcionamento do HTML original e reduzir o risco de alterar a lógica de disponibilidade.

Na próxima etapa, podemos migrar para tabelas reais (equipamentos, locações, manutenções e movimentações), mantendo a mesma interface.
