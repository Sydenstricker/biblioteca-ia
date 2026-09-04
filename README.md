# Biblioteca de IA

Mapa consultável de aplicações, ferramentas e projetos de inteligência artificial,
organizados por indústria, função e modalidade. Site estático em GitHub Pages,
alimentado por um coletor automático que abre Pull Requests para revisão.

Custo de operação: **zero**, exceto os centavos de API do classificador.

---

## Como funciona

```
                        cron semanal (GitHub Actions)
                                   │
   ┌───────────────────────────────▼───────────────────────────────┐
   │  1. FONTES        GitHub API · Hacker News (Algolia)          │
   │  2. PORTÃO        dedup + heurísticas    ← sem custo de LLM    │
   │  3. CLASSIFICADOR Claude, taxonomia fechada + strict tools     │
   │  4. PULL REQUEST  itens novos → você aprova                    │
   └───────────────────────────────┬───────────────────────────────┘
                                   │  merge
                          data/itens.json
                                   │
                          index.html (GitHub Pages)
                     filtros facetados + busca + URL compartilhável
```

## Por que Pull Request

Este é o detalhe que separa o projeto de um agregador que apodrece.

Ingestão automática direto na `main` parece prática por duas semanas. Depois o
acervo tem centenas de wrappers triviais e listas "awesome", e ninguém — nem você —
consulta mais. O coletor por isso **nunca escreve na `main`**: ele abre um PR, e
aprovar leva meio minuto no celular.

Bônus: o diff do PR é, de graça, o seu resumo periódico de novidades do setor.

Há três filtros em série, do mais barato ao mais caro:

| Filtro | Onde | Custo | Barra |
|---|---|---|---|
| Dedup + regex | `portao()` em `coletor/main.js` | zero | já visto, `awesome-*`, cursos, roadmaps |
| Campo `relevante` | classificador LLM | ~1 token | wrappers triviais, tutoriais, repos de estudo |
| Você | diff do PR | 30 s | o resto |

Descartes vão para `data/rejeitados.json` e **nunca voltam** — nada é reprocessado
nem re-sugerido.

## A taxonomia é fechada, de propósito

`taxonomia.json` é o ativo central. O classificador recebe seus valores como `enum`
num *strict tool schema*, então o modelo **não consegue** devolver "Healthcare"
quando a taxonomia diz "Saude".

Sem isso o acervo acumula sinônimos, e filtro facetado com sinônimos não funciona:
você marca "Saúde" e perde metade dos itens de saúde. Criar uma categoria nova é
editar `taxonomia.json` — e só.

## Tendência precisa de série temporal

Um `itens.json` sobrescrito a cada rodada guarda só o presente. Para enxergar
movimento, o coletor registra:

- `primeira_aparicao` — quando entrou no acervo
- `ultima_verificacao` / `mencoes` — quantas vezes reapareceu nas fontes
- `data/sinais.jsonl` — log append-only de estrelas e pontos por data

A ordenação **Em alta** do site combina menções, frescor e popularidade.

---

## Hub em destaque: IA em Tribunais

`tribunais.html` é um hub próprio sobre inteligência artificial no Judiciário, com
eixo no Brasil e o mundo como referência. Três coleções, porque têm ciclos de vida
diferentes e forçá-las num mesmo schema estragaria as três:

| Coleção | Natureza | Origem |
|---|---|---|
| **Aplicações** | catálogo estável | curadoria manual + extração das notícias |
| **Notícias** | fluxo que decai (podado em 18 meses) | Google News RSS, PT e EN |
| **Artigos** | referência permanente | OpenAlex + arXiv |

### O campo `verificacao` é decidido pelo domínio, não pelo modelo

Este domínio circula mito como fato. O caso canônico é o **"juiz-robô da Estônia"**:
noticiado em 2019 pela Wired, replicado pelo Fórum Econômico Mundial e por artigos
acadêmicos, e **desmentido formalmente** pelo Ministério da Justiça estoniano.

Mas "isto é fonte primária?" não é pergunta sobre o conteúdo — é sobre **quem
publicou**. Isso o domínio responde de forma determinística, gratuita e auditável,
melhor do que um LLM adivinhando. `coletor/procedencia.js` decide:

| Domínio | Resultado |
|---|---|
| `.jus.br`, `.mp.br`, `.gov.br`, `.gov`, `europa.eu`, `coe.int`… | `fonte_primaria` |
| qualquer outro | `fonte_secundaria` |
| DOI, arXiv, SciELO (só para `artigo`) | `fonte_primaria` — o link é a própria obra |

**A regra de ouro: só o domínio promove.** O classificador de IA nunca pode marcar
algo como primária; ele só responde sobre *disputa factual* (campo `disputa`), e
pode **rebaixar** para `contestado` ou `desmentido` — inclusive sobre um domínio
oficial, já que um órgão pode publicar algo depois negado. Assim o pior erro
possível é subestimar a procedência, nunca afirmar oficialidade inexistente.

O caso que motivou tudo isso: uma matéria do `tudorondonia.com` sobre o TJRO. Bem
escrita, sobre um tribunal — exatamente o item que o modelo promovia a "confirmado
oficialmente". O domínio não se confunde.

Isso só é possível porque o RSS do Google News traz `<source url="...">` com o
domínio real do veículo — o `<link>` é sempre um redirecionador que o esconde.

O caso da Estônia **está no acervo de propósito**, marcado como desmentido, para que
quem encontrar a afirmação já ache aqui o desmentido junto.

### A notícia alimenta o catálogo

Não existe API que liste "sistemas de IA em uso nos tribunais" — esse pilar é
inevitavelmente curado. Para que não dependa só de trabalho manual, o classificador
extrai de cada notícia os **sistemas nomeados** (ASSIS, VICTOR, Athos, Arandu…) e os
grava em `data/tribunais/candidatos-aplicacoes.json`.

Candidatos **não entram no catálogo sozinhos**: você confirma cada um com fonte
primária e escreve a ficha. É o passo manual que sustenta a credibilidade do hub.

### Nota sobre a Resolução CNJ

A norma vigente é a **Resolução CNJ nº 615/2025** (em vigor desde 14/07/2025), que
**revogou a 332/2020** — exceto quanto ao STF, que tem autonomia administrativa
própria. Boa parte do material na internet ainda cita a 332 como vigente.

### Rodando o hub

```bash
node coletor/main-tribunais.js --seco   # sem gastar LLM
node coletor/main-tribunais.js          # pipeline completo
node coletor/teste-tribunais.js         # testes
```

## Rodando localmente

```bash
cd coletor && npm install && cd ..

# ver o que seria coletado, sem gastar um token
node coletor/main.js --seco

# pipeline completo (precisa de ANTHROPIC_API_KEY)
node coletor/main.js
node coletor/promover.js

# testes
node coletor/teste-frontend.js
```

Servir o site (qualquer servidor estático — `fetch` não funciona via `file://`):

```bash
npx serve .
```

## Publicando

1. Suba o repositório para o GitHub.
2. **Settings → Pages → Source:** branch `main`, pasta `/` (root).
3. **Settings → Secrets and variables → Actions → New repository secret:**
   `ANTHROPIC_API_KEY`.
4. Opcional — **Variables:** `MODELO_CLASSIFICADOR` para trocar de modelo sem
   mexer no código.
5. Em `index.html`, aponte `#link-repo` para o seu repositório.

Depois disso o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Custo

Tudo é gratuito — GitHub Actions, Pages, a API do GitHub, o Algolia do Hacker News —
**exceto a classificação pelo Claude**. Itens vão em lotes de 8 por chamada e o
prefixo (ferramenta + *system prompt*) é cacheado, então o gasto é dominado pelos
tokens de saída.

A primeira rodada é a cara. Depois dela, o portão de dedup bloqueia de graça tudo
que já está no acervo ou em `rejeitados.json`, e só o que é genuinamente novo chega
ao modelo:

| | Itens | `claude-opus-5` | `claude-haiku-4-5` |
|---|---|---|---|
| Primeira rodada | ~127 | ~US$ 0,90 | ~US$ 0,18 |
| Cada semana depois | ~10 | ~US$ 0,12 | ~US$ 0,02 |
| **Por mês, em regime** | | **~US$ 0,50** | **~US$ 0,08** |

> Estes valores são **estimativas**, não medições. Cada rodada imprime o custo real
> calculado a partir do `usage` da resposta — é esse que vale.

Trocar de modelo é a variável `MODELO_CLASSIFICADOR` no GitHub, sem mexer no código.

### PR não mesclado custa de novo

Enquanto um PR do coletor não é mesclado, os itens dele ficam num limbo: não estão
no acervo nem em `rejeitados.json`. Na rodada seguinte o coletor os reencontra e
**paga para reclassificar os mesmos itens**.

Não é grave — o conjunto é limitado, então gira em torno de US$ 0,12/semana rodando
em falso — mas o hábito certo é dar merge ou editar o PR na mesma semana. Fechar o
PR sem merge não basta: os itens voltam na próxima rodada.

### Como gastar menos, ou zero

1. **Cron mensal** em vez de semanal (uma linha em `coletar.yml`) — corta por 4.
2. **Modelo mais barato** — variável `MODELO_CLASSIFICADOR`.
3. **Zero:** apague o bloco `schedule:` do workflow. Ele passa a rodar só pelo botão
   "Run workflow", e você paga apenas quando decide atualizar. Deixa de ser
   automático e vira sob demanda.

## Estrutura

```
taxonomia.json          vocabulário fechado — o ativo central
index.html              o site
assets/estilo.css       tokens de cor, tema claro/escuro
assets/app.js           filtros, busca, ordenação, estado na URL
data/itens.json         o acervo
data/rejeitados.json    memória de descartes (nunca reprocessados)
data/sinais.jsonl       série temporal, append-only
coletor/schema.js       forma do item, dedup, validação
coletor/fontes/*.js     um arquivo por fonte
coletor/classificador.js  Claude + strict tools
coletor/main.js         orquestrador
coletor/promover.js     pendentes → acervo
coletor/teste-frontend.js  teste de fumaça sem navegador
coletor/dom-falso.js    DOM mínimo compartilhado pelos testes

—— hub IA em Tribunais ——
tribunais.html          a página do hub
assets/tribunais.js     três vistas: aplicações, notícias, artigos
taxonomia-tribunais.json  vocabulário do hub, com a dimensão `verificacao`
data/tribunais/         aplicações, notícias, artigos, candidatos
coletor/rss.js          parser de RSS/Atom sem dependência
coletor/fontes/noticias-tribunais.js  Google News RSS (PT + EN)
coletor/fontes/academico.js           OpenAlex + arXiv
coletor/classificador-tribunais.js    classifica e extrai sistemas nomeados
coletor/main-tribunais.js             orquestrador do hub
coletor/procedencia.js  regra de dominio: quem publicou decide a procedencia
coletor/teste-procedencia.js          testes da regra de dominio
coletor/teste-tribunais.js            testes do hub
```

## Adicionar uma fonte

Crie `coletor/fontes/nome.js` exportando `nome` e `coletar()`, devolvendo objetos
com `{ nome, url, descricao, fonte_url, sinais }`. Registre em `FONTES` no
`main.js`. O resto do pipeline não muda.

Fontes com API pública e estável valem muito mais que scraping: o scraping quebra
sozinho e costuma esbarrar em termos de uso.

## Próximos passos possíveis

- **Busca semântica** — hoje a busca é lexical sem acento, o que cobre a maior parte
  dos casos. Busca por dor em linguagem natural ("ler contratos de 500 páginas")
  pediria embeddings pré-computados no JSON.
- **Backend leve** (Cloudflare Pages + D1) — só vale quando o acervo provar valor;
  libera votos da comunidade e sinalização de "descontinuado".
- **Verificação de link morto** — um job mensal marcando `status: "suspeito"` em
  URLs que retornam 404.
