# PavimentoLab PWA

POC para coletar vibração + GPS do celular e exportar CSV/GeoJSON.

## Como usar no Android

1. Suba os arquivos em um local HTTPS, como GitHub Pages.
2. Abra `index.html` pelo Chrome do celular.
3. Toque em "Adicionar à tela inicial".
4. Abra o app instalado.
5. Clique em "Liberar sensores".
6. Prenda o celular firme no carro.
7. Clique em "Calibrar parado 15s".
8. Clique em "Iniciar coleta".
9. Ao terminar, clique em "Parar".
10. Exporte CSV ou GeoJSON.

## Observações importantes

- O acesso aos sensores funciona melhor em HTTPS.
- O GPS precisa de permissão do navegador.
- A calibração é salva no próprio celular.
- As coletas ficam no localStorage do navegador.
- Para POC está ótimo, mas depois vale migrar para IndexedDB se os arquivos ficarem grandes.
- Use sempre a mesma posição do celular para comparar coletas.
