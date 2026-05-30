# PavimentoLab v21.7 IndexedDB

## Versão

v21.7

## Branch

feature/v21.7-restaura-qualidade-e-resumo

## Pull Request

v21.7 - Restaura qualidade, resumo e histórico

## Motivo

Restaura a lógica antiga de qualidade baseada no eixo Z calibrado, volta a alimentar percentuais de qualidade durante a corrida, grava resumo de qualidade no histórico e remove nome fixo do dispositivo na coleta.

## Impactos avaliados

- Sensores: volta a armazenar amostras com ax/ay/az.
- Calibração: volta a calcular azMean/azStd.
- Classificação: mantém limites fixos 0.45 / 1.10 / 2.00.
- Histórico: passa a exibir resumo de qualidade por corrida.
- Exportação: mantém ZIP/CSV/trechos.
- Dispositivo: nome da coleta deixa de usar motorola_g82 fixo.

URL:

`https://m-martins.github.io/pavimentolab/?v=21-7`
