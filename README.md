# PavimentoLab v21.7.1

## Versão

v21.7.1

## Branch

feature/v21.7.1-corrige-botoes-dados-locais

## Pull Request

v21.7.1 - Corrige botões de Dados locais

## Motivo

Corrige os botões `importar backup` e `procurar` no painel de Dados locais, adicionando fallback de evento para mobile, feedback visual quando não houver dados antigos e mantendo a lógica de qualidade restaurada da v21.7.

## Análise dos registros enviados

- A coleta de 10,8 km registrou 704 trechos, com 27% bom, 27% regular, 17% ruim e 30% crítico.
- A coleta de 1,1 km registrou 68 trechos, com 41% bom, 28% regular, 21% ruim e 10% crítico.
- As duas coletas já gravam resumo de qualidade no histórico.
- O próximo ponto técnico é calibrar melhor os limiares/ruído, não mexer novamente em UI.

URL:

`https://m-martins.github.io/pavimentolab/?v=21-7-1`
