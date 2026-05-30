# PavimentoLab v20.2 IndexedDB

Correção da v20.1:

- Versão visível `v20.2`.
- Mantém IndexedDB como banco principal.
- Mantém calibração antes de iniciar.
- Limpa camada de rota ao abrir o app.
- Recalibra o cálculo de rugosidade usando `baseline_mean`.
- Reduz sensibilidade da classificação para evitar tudo crítico/vermelho.
- Mantém mapa limpo e auto-follow.

## Teste rápido

1. Abrir e confirmar `v20.2 indexeddb`.
2. O mapa não deve abrir com rota antiga desenhada.
3. Iniciar gravação.
4. Aguardar calibração.
5. Rodar trecho curto.
6. Ver se as cores variam entre verde/amarelo/laranja/vermelho.
