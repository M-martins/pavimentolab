# PavimentoLab PWA v2

POC para coletar vibração + GPS do celular e exportar:
- CSV de pontos
- GeoJSON de pontos
- GeoJSON de trechos/linhas

## Novidades da v2

- Botão Pausar/Retomar.
- O acelerômetro acumula leituras no intervalo.
- O GPS fecha o registro espacial.
- Cada ponto salvo tem estatísticas do intervalo anterior.
- Os trechos são criados entre pontos GPS consecutivos válidos.
- Exportação separada de pontos e linhas.

## Como usar no Android

1. Suba os arquivos em um local HTTPS, como GitHub Pages.
2. Abra o link pelo Chrome do celular.
3. Toque em "Adicionar à tela inicial".
4. Abra o app instalado.
5. Clique em "Liberar sensores".
6. Prenda o celular firme no carro.
7. Clique em "Calibrar parado 15s".
8. Clique em "Iniciar coleta".
9. Use "Pausar" quando quiser ignorar um período.
10. Ao terminar, clique em "Parar e salvar".
11. Exporte CSV, pontos GeoJSON ou trechos GeoJSON.

## Observações

- O acesso aos sensores funciona melhor em HTTPS.
- Use sempre a mesma posição do celular.
- A calibração e as coletas ficam no armazenamento local do navegador.
- Para testes longos, futuramente vale migrar de localStorage para IndexedDB.
