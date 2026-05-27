# PavimentoLab v12 clean

Base limpa, sem herança das versões anteriores.

## Controle
A versão aparece:
- no topo da interface
- no menu lateral
- no console
- nos metadados dos arquivos exportados
- no histórico

## Lógica
- Pontos brutos sempre salvos.
- Anti-drift: deslocamentos GPS menores que 2 m não acumulam trecho.
- Trechos fechados a cada 10 m válidos.
- Pontos simplificados = início e fim de cada trecho.
- Auto-follow simples durante gravação.
- Service Worker desativado/desregistrado.
