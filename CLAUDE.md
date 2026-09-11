# Jogo 3D de Caça de Pássaros — Especificação

Desenvolva um jogo de caça em primeira pessoa, totalmente 3D, executado diretamente no navegador e capaz de funcionar offline após os arquivos do jogo estarem disponíveis localmente.

O jogo deve ser simples, imersivo e focado exclusivamente na exploração de uma floresta e na caça de pássaros. Não deve possuir campanha, fases, níveis, missões, inventário complexo ou sistema de progressão.

## 1. Plataforma e execução

* O jogo deve rodar em um navegador moderno.
* Deve funcionar offline, sem depender de servidor ou conexão com a internet durante a execução.
* Todos os modelos 3D, texturas, sons, scripts e demais recursos necessários devem estar disponíveis localmente.
* O jogo deve ser otimizado para navegador e evitar consumo desnecessário de memória e processamento.
* A experiência deve iniciar diretamente no mundo do jogo, sem tela de título ou menu principal.

## 2. Visão e controles

O jogo deve utilizar câmera em primeira pessoa.

O jogador controla um personagem que possui uma arma de caça/rifle bolt-action inspirada visualmente em uma Kar98k/"Spiner Kar98".

O jogador deve conseguir:

* Andar.
* Correr.
* Agachar.
* Olhar livremente em todas as direções com o mouse.
* Mirar utilizando a arma.
* Atirar.
* Recarregar automaticamente quando o carregador acabar.

Não deve existir sistema de stamina. O jogador pode correr indefinidamente.

Também não devem existir sistemas de:

* Fome.
* Sede.
* Sono.
* Vida/necessidade de sobrevivência.
* Cansaço.
* Clima que prejudique o jogador.
* Progressão de personagem.

A movimentação deve ser livre e confortável, permitindo explorar o ambiente sem restrições artificiais.

## 3. Cenário

O cenário principal é uma grande floresta natural.

A ambientação deve representar constantemente o final da tarde, pouco antes do anoitecer.

A iluminação deve ser relativamente baixa, criando uma atmosfera mais cinematográfica e contemplativa, mas o cenário ainda precisa permanecer suficientemente visível para que o jogador consiga identificar pássaros e elementos importantes do ambiente.

A floresta deve possuir variedade visual, incluindo elementos como:

* Árvores de diferentes tamanhos.
* Arbustos.
* Vegetação rasteira.
* Grama.
* Pequenas plantas.
* Troncos e galhos.
* Pedras.
* Pequenas clareiras.
* Variações de terreno.
* Áreas mais densas e áreas mais abertas.

O objetivo é evitar que o ambiente pareça um cenário plano ou repetitivo.

A iluminação deve utilizar sombras e ambientação adequadas para transmitir a sensação de fim de tarde.

## 4. Mundo aberto e infinito

O mundo deve ser percebido pelo jogador como infinito.

Não deve existir uma borda visível tradicional, como uma parede, limite do mapa ou área bloqueada.

Para tornar isso viável no navegador, utilize geração procedural, streaming de terreno/chunks ou outro sistema equivalente.

O mundo pode ser dividido internamente em regiões/chunks carregados e descarregados conforme a posição do jogador.

O jogador deve conseguir caminhar continuamente em qualquer direção e encontrar novas áreas da floresta.

A geração procedural deve produzir variações suficientes para evitar que o jogador perceba rapidamente um padrão de repetição.

## 5. Pássaros

Os pássaros são os principais elementos interativos do jogo.

Eles devem aparecer aleatoriamente pelo mundo.

A quantidade de pássaros deve ser controlada por um sistema de spawn dinâmico, evitando tanto um cenário vazio quanto uma quantidade excessiva de animais simultaneamente.

Os pássaros podem:

* Voar pelo cenário.
* Pousar em árvores ou no chão.
* Permanecer parados por determinados períodos.
* Mudar de direção.
* Voar para longe quando apropriado.
* Surgir em diferentes regiões do mundo.

O comportamento deve ser relativamente natural, evitando movimentos robóticos.

Os pássaros não devem aparecer diretamente na frente do jogador de maneira artificial. O sistema de spawn deve considerar distância, direção e visibilidade para produzir encontros mais naturais.

Deve haver diferentes tipos/variações visuais de pássaros para aumentar a diversidade do ambiente.

## 6. Sistema de caça

O objetivo do jogador é encontrar e caçar os pássaros.

O jogador pode observar um pássaro e decidir livremente se deseja atirar ou não.

Não deve haver missões obrigatórias nem objetivos pré-definidos.

A experiência deve ser totalmente livre:

1. O jogador explora a floresta.
2. Encontra um pássaro.
3. Observa seu comportamento.
4. Decide se deseja mirar.
5. Atira, caso queira.
6. Se o tiro atingir o pássaro de maneira letal, ele morre.
7. O pássaro cai fisicamente no ambiente.
8. O jogador recebe pontos.

O jogador não precisa coletar o pássaro.

Depois que um pássaro morrer, ele se torna apenas um objeto visual no cenário. O jogador não poderá interagir, pegar, carregar, vender ou coletar o animal morto.

## 7. Física da morte dos pássaros

Quando um pássaro for atingido por um tiro letal:

* Ele deve parar seu comportamento de voo.
* Deve entrar em estado de morte.
* Deve cair em direção ao chão.
* A queda deve parecer física e natural.
* Ao atingir o chão, deve permanecer ali como um pássaro morto.

O corpo deve permanecer visível por algum tempo.

Não é necessário criar sistema de interação com o corpo.

Opcionalmente, corpos muito antigos podem ser removidos automaticamente para evitar consumo excessivo de memória em uma sessão muito longa.

## 8. Pontuação

Cada pássaro abatido concede pontos ao jogador.

A pontuação deve ser exibida de forma discreta na interface.

Não deve existir:

* Loja.
* Ranking obrigatório.
* Sistema de níveis.
* XP.
* Melhorias de personagem.
* Desbloqueios.
* Progressão.
* Missões.

A pontuação serve apenas como feedback e registro da quantidade de pássaros abatidos.

## 9. Arma

O jogador deve iniciar o jogo já equipado com uma arma inspirada em uma Kar98k.

A arma deve ficar visível na parte inferior da tela, seguindo o padrão de jogos FPS.

Ela deve possuir:

* Animação/efeito visual de tiro.
* Som de disparo.
* Mira.
* Carregador com quantidade limitada de tiros.
* Munição total infinita.

Apesar de a munição ser infinita, o carregador deve possuir capacidade limitada.

Quando o carregador ficar vazio, o jogador deve ser automaticamente impedido de disparar e o jogo deve iniciar uma recarga automática.

Não é necessário criar uma animação de recarga.

Durante a recarga:

* Reproduzir um som de recarga.
* Exibir uma mensagem curta como "Recarregando...".
* Após um pequeno intervalo, o carregador deve estar novamente cheio.
* O jogador pode voltar a disparar.

O jogador não precisa pressionar nenhuma tecla para recarregar.

## 10. Mira

O jogador deve conseguir utilizar a mira da arma.

Ao entrar no modo de mira:

* A câmera deve aproximar-se ou utilizar um efeito equivalente.
* A arma deve assumir uma posição apropriada para mirar.
* A precisão deve aumentar.
* A interface pode apresentar uma mira/retículo apropriado.

A mira deve permitir que o jogador faça disparos precisos contra pássaros distantes.

## 11. Tiro e detecção de impacto

O disparo deve utilizar um sistema confiável de detecção de colisão/hit detection.

O tiro deve considerar a direção exata para a qual a arma/câmera está apontando.

Quando um pássaro for atingido:

* Verificar se o impacto é letal.
* Se for letal, executar o comportamento de morte.
* Adicionar pontos à pontuação.
* Reproduzir efeitos sonoros apropriados.
* Fazer o pássaro cair no chão.

Não deve ser possível pontuar várias vezes atirando no mesmo pássaro morto.

Depois de morto, o pássaro deve permanecer em estado inativo e não responder a novos disparos como um alvo vivo.

## 12. Interface

A interface deve ser mínima.

Não deve existir menu principal.

Ao carregar o jogo, o jogador deve entrar diretamente na floresta.

A HUD pode mostrar apenas informações essenciais, como:

* Pontuação.
* Munição restante no carregador.
* Estado de recarga.
* Retículo/mira.

A interface não deve ocupar grande parte da tela.

Durante a recarga, mostrar temporariamente:

"Recarregando..."

Após a conclusão, a mensagem deve desaparecer.

## 13. Áudio

O áudio deve contribuir significativamente para a atmosfera.

O ambiente deve possuir sons como:

* Pássaros cantando.
* Vento.
* Folhas movimentando.
* Sons ambientes da floresta.
* Sons ocasionais de animais.
* Som de passos.
* Som de corrida.
* Som de movimentação na vegetação.

A arma deve possuir:

* Som de disparo.
* Som de recarga.
* Eventuais sons mecânicos da arma.

Os sons dos pássaros devem ocorrer espacialmente, permitindo ao jogador perceber aproximadamente de onde vêm.

## 14. Atmosfera

A experiência deve transmitir uma sensação de exploração silenciosa e caça em uma floresta durante o final da tarde.

A direção visual deve priorizar:

* Iluminação baixa.
* Sombras longas.
* Luz quente do fim de tarde.
* Áreas parcialmente escuras entre as árvores.
* Névoa atmosférica leve, se adequada ao desempenho.
* Vegetação densa.
* Sons ambientes naturais.
* Sensação de espaço e isolamento.

O objetivo não é criar um jogo de terror. A atmosfera deve ser natural, contemplativa e imersiva.

## 15. Ausência de começo e fim

O jogo não possui uma estrutura tradicional de início e término.

Assim que os arquivos forem carregados:

* O jogador já estará na floresta.
* A arma já estará equipada.
* O mundo já estará funcionando.
* Os pássaros já poderão aparecer.
* O jogador poderá começar a explorar imediatamente.

Não existe:

* Tela de início.
* Tutorial obrigatório.
* Cutscene.
* História.
* Campanha.
* Fase final.
* Tela de vitória.
* Tela de derrota.
* Game over.
* Condição de término.

A sessão deve continuar indefinidamente enquanto o jogador quiser permanecer jogando.

## 16. Requisitos técnicos importantes

Priorize desempenho e estabilidade no navegador.

O sistema deve evitar criar milhares de objetos simultaneamente.

Utilize técnicas apropriadas para jogos web, como:

* Chunking do mundo.
* Object pooling.
* Level of Detail (LOD).
* Frustum culling.
* Instancing para vegetação repetida.
* Descarregamento de regiões distantes.
* Limitação do número de pássaros ativos.
* Reutilização de entidades.
* Carregamento assíncrono de recursos quando necessário.

O mundo deve dar a impressão de ser infinito sem exigir que toda a floresta exista simultaneamente na memória.

O sistema também deve ser projetado para sessões longas, evitando vazamentos de memória e acúmulo ilimitado de objetos mortos.

## 17. Resumo da experiência

A experiência final deve ser essencialmente:

"Entrar em uma floresta 3D no final da tarde, caminhar livremente com um rifle em primeira pessoa, ouvir e procurar pássaros, encontrar um alvo, decidir se vale a pena mirar e atirar, observar o pássaro cair e continuar explorando a floresta em busca de novos alvos."

O jogo deve ser simples em termos de regras, mas convincente em termos de atmosfera, movimentação, áudio, iluminação, comportamento dos pássaros e sensação de exploração.

A prioridade deve ser uma experiência FPS de caça minimalista, contínua e procedural, sem menus, sem progressão e sem objetivos obrigatórios.

## 18. Como executar

Por ser um projeto extenso, você pode dividir a implementação em etapas.
Ir testando cada etapa até sua conclusão e depois, podemos seguir para as próximas.
Isso irá ajudar quanto a quantidade de tokens utilizada.

Você pode criar um arquivo para documentar as etapas, quais estão prontas, quais a fazer e quaisquer outros detalhes úteis para você continuar a implementação mesmo que a sessão caia.
