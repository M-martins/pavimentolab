# PavimentoLab v18 data recovery

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


## Mudanças da v16

- Remove o popup `confirm()` de recuperação.
- Recupera automaticamente coletas não finalizadas e salva no histórico.
- Migra históricos antigos das versões v12, v13, v14 e v15 para a v16.
- Remove rascunhos vazios.
- Adiciona botão `backup` no histórico para exportar todo o armazenamento local em JSON.
- A versão da interface passa a mostrar `v16 recovery`.

## Chaves locais

- `pavimentolab_collections_v16`: histórico ativo.
- `pavimentolab_current_v16`: rascunho ativo.
- A v16 tenta migrar automaticamente dados das chaves antigas.


## Mudanças da v17

- Adiciona painel "Dados locais" no menu.
- Varre todo o `localStorage` do domínio em busca de coletas antigas.
- Detecta listas de coletas, rascunhos e backups JSON.
- Permite importar coletas encontradas para o histórico atual.
- Permite exportar backup por chave local encontrada.
- Migra também dados da v16.
- A versão da interface passa a mostrar `v17 history finder`.

## Uso recomendado

1. Abra o menu.
2. Clique em `procurar`.
3. Se aparecer alguma chave com coletas, clique em `importar`.
4. Depois use `backup` para salvar uma cópia local.


## Mudanças da v18

- Corrige a importação de dados locais encontrados pelo scanner.
- Adiciona importação de backup JSON.
- Adiciona centralização automática na localização ao abrir o app.
- Melhora diagnóstico:
  - histórico atual
  - rascunhos locais
  - tamanho aproximado do localStorage
  - chave ativa
- Adiciona botão para limpar rascunhos antigos com confirmação.
- Melhora deduplicação de coletas importadas.
- Migra também dados v17.

## Testes recomendados

1. Menu > Dados locais > procurar > importar uma chave antiga.
2. Verificar se aparece no histórico.
3. Backup > apagar histórico > importar backup JSON.
4. Abrir o app e validar se o mapa sai da Sé para a localização atual.
