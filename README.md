# PavimentoLab v21.1 IndexedDB

Versão cirúrgica baseada na última v20.x funcional.

## O que mudou

Somente a classificação voltou para a lógica antiga:

- bom: `< 0.45`
- regular: `< 1.10`
- ruim: `< 2.00`
- crítico: `>= 2.00`

Fórmula:

`roughness_index = mean + (std * 0.5) + min(1, peakCount / 10)`

## O que NÃO foi mexido

- mapa;
- GPS;
- auto-follow;
- IndexedDB;
- calibração;
- histórico;
- exportação.

URL:

`https://m-martins.github.io/pavimentolab/?v=21-1`
