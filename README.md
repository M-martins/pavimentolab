# PavimentoLab v20 IndexedDB

Versão arquitetural com IndexedDB como armazenamento principal.

## O que mudou

- O `localStorage` deixa de ser o banco principal.
- Coletas ficam no IndexedDB.
- Pontos ficam em uma store própria.
- Trechos ficam em uma store própria.
- Histórico é lido do banco local.
- Exportações carregam os dados do banco sob demanda.
- Importação de backups antigos converte JSON para IndexedDB.
- Scanner de dados locais antigos continua disponível.

## Testes recomendados

1. Abrir o app e verificar se o mapa aparece.
2. Abrir o menu e conferir `Banco local`.
3. Gravar 1 minuto e parar.
4. Exportar ZIP.
5. Importar o backup grande da v14.
6. Apagar uma coleta de teste.
7. Fechar o navegador durante uma coleta curta e verificar se há rascunho no banco.

## Branch sugerida

`v20-indexeddb`
