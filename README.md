# PavimentoLab v14 metadata + zip

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


## Mudanças da v13

- Ao parar a gravação, o app mostra "Consolidando dados".
- A coleta é salva no histórico antes de qualquer exportação.
- A exportação passa a ser sob demanda: agora ou depois pelo histórico.
- Os botões de exportação mostram "Gerando arquivo" antes do download.
- O encerramento fica protegido contra clique duplo/reinício acidental.
- Metadados `finalizedAt` e `summary` adicionados à coleta.


## Mudanças da v14

- Metadados automáticos do dispositivo:
  - userAgent
  - plataforma
  - idioma
  - resolução de tela
  - devicePixelRatio
  - núcleos de CPU
  - memória aproximada, quando disponível
  - timezone
- Resumo automático da corrida:
  - distância
  - duração
  - pontos
  - trechos
  - GPS médio
  - velocidade média
  - distribuição por classe
  - pior trecho
  - avisos de qualidade
- Exportação de pacote ZIP único:
  - resumo.json
  - pontos_brutos.csv
  - pontos_brutos.geojson
  - pontos_simplificados.geojson
  - trechos.geojson
- Metadados de dispositivo e resumo nos GeoJSON.
