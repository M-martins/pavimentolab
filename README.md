# PavimentoLab v15 robust stop

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


## Mudanças da v15

Foco exclusivo em robustez do encerramento:

- Ao parar, a coleta é salva no histórico antes de qualquer resumo, ZIP ou exportação.
- A interface é resetada logo após salvar.
- O resumo passa a ser calculado depois, de forma protegida.
- Se o resumo falhar, a coleta continua salva.
- Se o modal/exportação falhar, a coleta continua salva.
- Adicionado fallback de preservação em caso de erro crítico.
- A versão da interface passa a mostrar `v15 robust stop`.

## Onde os dados ficam no celular

Os dados ficam no armazenamento local do navegador, em `localStorage`, no domínio do GitHub Pages.

Chaves principais:
- `pavimentolab_collections_v15`: histórico de coletas finalizadas.
- `pavimentolab_current_v15`: rascunho da coleta em andamento.

No Android/Chrome isso fica dentro dos dados do app Chrome/PWA. Limpar dados do site, limpar armazenamento do Chrome ou remover dados do app pode apagar as coletas locais.
