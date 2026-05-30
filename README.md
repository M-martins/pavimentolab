# PavimentoLab v21 IndexedDB

Versão com IndexedDB, mas retomando a lógica antiga de classificação.

## Mantido

- IndexedDB como armazenamento principal.
- Calibração obrigatória de 10 segundos.
- Mapa limpo.
- Histórico no banco local.
- Exportação sob demanda.

## Corrigido

- Volta para os limiares antigos:
  - bom: `< 0.45`
  - regular: `< 1.10`
  - ruim: `< 2.00`
  - crítico: `>= 2.00`
- Volta para o índice antigo:
  - `roughness_index = mean + (std * 0.5) + min(1, peakCount / 10)`
- Sem reclassificação posterior.
- Classes continuam fixas: bom, regular, ruim e crítico.

## URL

`https://m-martins.github.io/pavimentolab/?v=21`
