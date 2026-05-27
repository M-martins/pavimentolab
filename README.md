# PavimentoLab PWA v6 - Map First 10m

Nova versão com interface centrada no mapa.

## Inclui

- Mapa central com base Carto/OSM mais limpa
- Posição atual do veículo
- Botão de minha localização
- Trechos coloridos por classe
- Indicador de qualidade da coleta em porcentagem
- Distância da corrida
- Tempo de gravação
- Velocidade média
- Botão de pausa
- Botão de parar com "segure para parar"
- Menu lateral com qualidade dos sensores e histórico
- Exportação CSV de pontos
- Exportação GeoJSON de pontos
- Exportação GeoJSON de trechos
- Wake Lock API para tentar manter a tela ligada
- GPS como limitante espacial da coleta
- Pontos GPS salvos continuamente, mas trechos agregados a cada 10 metros

## Observações

- O mapa precisa de internet para carregar a base.
- A coleta e exportação são locais.
- Para o Android não dormir, também configure o Chrome como "sem restrições" na bateria.


## Mudança da v6

A coleta continua salvando os pontos GPS, mas a camada de trechos agora só é fechada quando o deslocamento acumulado atinge aproximadamente 10 metros. Isso reduz trechos muito curtos e deixa o mapa mais limpo.

## Tela ligada

A versão usa Wake Lock API para tentar manter a tela ligada, mas no Android isso pode falhar dependendo das permissões do Chrome e da economia de bateria. Para melhorar:

1. Configurações do Android > Apps > Chrome > Bateria > Sem restrições.
2. Não bloquear a tela durante a coleta.
3. Manter o app aberto em primeiro plano.
