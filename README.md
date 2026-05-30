# PavimentoLab v21.2 IndexedDB

Correção obrigatória do fluxo de gravação.

## O que foi travado

- Clicar em iniciar SEMPRE abre calibração.
- Calibração obrigatória de 10 segundos.
- A gravação só começa depois da calibração.
- O modal mostra contagem e quantidade de amostras.
- A calibração limpa o buffer antes e depois.
- Mantém os limites antigos:
  - bom `< 0.45`
  - regular `< 1.10`
  - ruim `< 2.00`
  - crítico `>= 2.00`
- Mantém IndexedDB.

URL:

`https://m-martins.github.io/pavimentolab/?v=21-2`
