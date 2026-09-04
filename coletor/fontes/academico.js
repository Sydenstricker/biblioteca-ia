// Fonte academica: OpenAlex e arXiv.
//
// OpenAlex e o motor -- catalogo aberto, sem chave, com DOI, contagem de citacoes e
// status de acesso aberto, e cobre direito, que o arXiv quase nao cobre.
//
// LICAO APRENDIDA, nao mexa sem medir: a busca livre (?search=) somada a ordenacao
// por citacoes devolve papers famosos de IA que apenas MENCIONAM "court" -- veio
// "Deep Fakes" e "Profiting from innovation" no teste. O filtro estruturado
// title_and_abstract.search resolve a maior parte; o resto e trabalho do portao de
// relevancia do LLM.

import { normalizarData } from '../rss.js';
import { analisar } from '../rss.js';

const TERMOS_IA = '"artificial intelligence" OR "machine learning" OR "large language model" OR "natural language processing"';

// MEDIDO, nao chute: "adjudication" e "courts" sozinhos traziam papers medicos
// ("adjudicacao de desfechos" e termo de ensaio clinico) -- vinham "Grader
// Variability" e "cardiovascular medicine" no topo. Trocados por expressoes
// juridicas especificas, o corpus caiu de 10.912 para 5.944 trabalhos e a
// precisao da primeira pagina foi de 3/6 para 6/6.
const TERMOS_JUSTICA = 'judiciary OR "judicial decision" OR "judicial system" OR "court decision" OR "legal reasoning" OR jurisprudence OR "case law"';

const ANO_MINIMO = 2018; // antes disso o tema e outro: sistemas especialistas, nao IA moderna

export const nome = 'academico';

/**
 * Sinais de citacao derivados de counts_by_year.
 *
 * O ano corrente e SEMPRE parcial, entao fica de fora das duas contas -- incluir
 * setembro como se fosse um ano faria todo artigo parecer em queda.
 *
 *   velocidade  citacoes por ano completo desde a publicacao. Normaliza a idade:
 *               um artigo de 2024 com 80 citacoes vale mais que um de 2018 com 200.
 *   aceleracao  ultimo ano completo dividido pela media dos anos anteriores. Capta
 *               o que esta subindo AGORA, inclusive obra antiga redescoberta.
 *               So e calculada com ao menos 2 anos anteriores e 5 citacoes no ano
 *               recente -- sem esse piso, 2 para 6 viraria "300% de crescimento".
 */
function sinaisDeCitacao(w) {
  const anoAtual = new Date().getFullYear();
  const total = w.cited_by_count || 0;
  const anosCompletos = Math.max(1, anoAtual - (w.publication_year || anoAtual));
  const velocidade = Number((total / anosCompletos).toFixed(1));

  const porAno = new Map((w.counts_by_year || []).map((x) => [x.year, x.cited_by_count]));
  const ultimoCompleto = anoAtual - 1;
  const recente = porAno.get(ultimoCompleto) ?? 0;
  const anteriores = [...porAno.entries()]
    .filter(([ano]) => ano < ultimoCompleto && ano > (w.publication_year || 0))
    .map(([, n]) => n);

  let aceleracao = null;
  if (anteriores.length >= 2 && recente >= 5) {
    const media = anteriores.reduce((a, b) => a + b, 0) / anteriores.length;
    if (media > 0) aceleracao = Number((recente / media).toFixed(2));
  }

  return { velocidade, aceleracao, citacoes_ano_recente: recente };
}

function urlOpenAlex(limite, ordenacao, filtrosExtra = '') {
  const filtro = `title_and_abstract.search:(${TERMOS_IA}) AND (${TERMOS_JUSTICA})`;
  return 'https://api.openalex.org/works'
    + '?filter=' + encodeURIComponent(filtro) + ',from_publication_date:' + ANO_MINIMO + '-01-01'
    + filtrosExtra
    + '&per-page=' + limite
    + '&sort=' + ordenacao
    // O OpenAlex pede um e-mail para entrar no "polite pool", com filas melhores.
    + '&mailto=' + encodeURIComponent(process.env.EMAIL_CONTATO || 'biblioteca-ia@example.org');
}

async function openAlex(log, limite, ordenacao = 'cited_by_count:desc', rotulo = 'citados', extra = '') {
  const url = urlOpenAlex(limite, ordenacao, extra);

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) { log('  [openalex] HTTP ' + resp.status); return []; }
    const j = await resp.json();
    log('  [openalex/' + rotulo + '] ' + j.results.length + ' de ' + j.meta.count + ' trabalhos');

    return j.results.map((w) => {
      const autores = (w.authorships || []).slice(0, 5).map((a) => a.author?.display_name).filter(Boolean);
      const veiculo = w.primary_location?.source?.display_name || 'nao informado';
      const resumo = reconstruirResumo(w.abstract_inverted_index);
      return {
        nome: (w.display_name || '').slice(0, 200),
        url: w.doi || w.primary_location?.landing_page_url || w.id,
        descricao: 'Titulo: ' + w.display_name
          + '\nAutores: ' + (autores.join(', ') || 'nao informado')
          + '\nAno: ' + w.publication_year + ' | Veiculo: ' + veiculo
          + '\nCitacoes: ' + w.cited_by_count + ' | Acesso aberto: ' + (w.open_access?.is_oa ? 'sim' : 'nao')
          + (resumo ? '\nResumo: ' + resumo.slice(0, 900) : ''),
        fonte_url: w.doi || w.id,
        _tipoAlvo: 'artigo',
        sinais: {
          ano: w.publication_year,
          citacoes: w.cited_by_count,
          acesso_aberto: !!w.open_access?.is_oa,
          doi: (w.doi || '').replace('https://doi.org/', ''),
          autores,
          veiculo,
          ...sinaisDeCitacao(w),
        },
      };
    });
  } catch (e) {
    log('  [openalex] falhou: ' + e.message);
    return [];
  }
}

/** O OpenAlex guarda o resumo como indice invertido palavra -> posicoes. Remontamos. */
function reconstruirResumo(indice) {
  if (!indice) return '';
  const palavras = [];
  for (const [palavra, posicoes] of Object.entries(indice)) {
    for (const p of posicoes) palavras[p] = palavra;
  }
  return palavras.filter(Boolean).join(' ');
}

async function arxiv(log, limite) {
  // MESMO erro que o do OpenAlex, repetido aqui e so descoberto depois: "court"
  // solto casa QUADRA de basquete -- veio "HoopMind: Opponent-Aware Game-Tree".
  // Expressoes juridicas especificas, nunca o termo isolado.
  const consulta = 'all:("legal reasoning" OR "legal judgment prediction" OR "judicial decision"'
    + ' OR "court decision" OR judiciary OR "case law" OR "legal text") '
    + 'AND all:("large language model" OR "artificial intelligence" OR "machine learning")';
  const url = 'http://export.arxiv.org/api/query?search_query=' + encodeURIComponent(consulta)
    + '&sortBy=submittedDate&sortOrder=descending&max_results=' + limite;

  try {
    const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!resp.ok) { log('  [arxiv] HTTP ' + resp.status); return []; }
    const entradas = analisar(await resp.text());
    log('  [arxiv] ' + entradas.length + ' preprints');

    return entradas.map((e) => ({
      nome: e.titulo.slice(0, 200),
      url: e.link,
      descricao: 'Titulo: ' + e.titulo
        + '\nPreprint arXiv, ' + (normalizarData(e.data) || 'data nao informada')
        + (e.descricao ? '\nResumo: ' + e.descricao.slice(0, 900) : ''),
      fonte_url: e.link,
      _tipoAlvo: 'artigo',
      sinais: {
        ano: Number((normalizarData(e.data) || '').slice(0, 4)) || null,
        citacoes: 0,
        acesso_aberto: true,
        veiculo: 'arXiv (preprint)',
      },
    }));
  } catch (e) {
    log('  [arxiv] falhou: ' + e.message);
    return [];
  }
}

export async function coletar({ log = console.log, limite = 25 } = {}) {
  // DUAS consultas ao OpenAlex, de proposito. Ordenar so por citacoes devolve
  // sempre os MESMOS classicos, que o dedup barra -- o pilar academico congelaria
  // depois da primeira rodada. A consulta por data traz o que acabou de sair, que
  // ainda nao tem citacao alguma e nunca apareceria na outra.
  // As duas consultas ao OpenAlex vao em SERIE: disparadas em paralelo, a segunda
  // levava HTTP 429. O arXiv e outro servico, entao pode correr junto.
  const preprintsProm = arxiv(log, 15);

  // 1. Os classicos: mais citados de todos os tempos. Conjunto estavel entre rodadas.
  const citados = await openAlex(log, limite, 'cited_by_count:desc', 'citados');
  await new Promise((r) => setTimeout(r, 1200));

  // 2. Os promissores: publicados nos ultimos 2 anos e JA com mais de 2 citacoes.
  //    MEDIDO: ordenar apenas por data devolvia artigos com zero citacao -- ser
  //    novo nao e ser promissor. Com o piso de citacoes vieram trabalhos como
  //    "Challenges for generative AI in legal reasoning" e "When should a computer
  //    decide?", que sao recentes e ja com tracao. O corpus cai de 4.643 para ~215
  //    trabalhos, e a precisao da primeira pagina sobe bastante.
  const doisAnosAtras = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
  const promissores = await openAlex(
    log, Math.round(limite * 0.6), 'publication_date:desc', 'promissores',
    ',from_publication_date:' + doisAnosAtras + ',cited_by_count:>2',
  );
  const preprints = await preprintsProm;

  const porUrl = new Map();
  for (const it of [...citados, ...promissores, ...preprints]) if (it.url) porUrl.set(it.url, it);

  // Dedup tambem por titulo: o OpenAlex devolve versoes do mesmo trabalho com DOIs
  // distintos, e sem isto o mesmo artigo seria classificado -- e pago -- duas vezes.
  const porTitulo = new Map();
  for (const it of porUrl.values()) {
    const chave = it.nome.normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!porTitulo.has(chave)) porTitulo.set(chave, it);
  }
  return [...porTitulo.values()];
}

/**
 * Rebusca os sinais de artigos JA no acervo, pelo DOI.
 *
 * Sem isto a contagem de citacoes congela no dia da coleta e "crescimento" nao
 * significa nada: o dedup impede que o item volte pelo caminho normal. E o
 * equivalente, para artigos, do que atualizarConhecidos() faz no coletor geral.
 */
export async function atualizarSinais(artigos, { log = console.log } = {}) {
  const comDoi = artigos.filter((a) => a.sinais?.doi);
  if (!comDoi.length) return 0;

  const LOTE = 40; // o filtro doi: aceita lista separada por |
  let atualizados = 0;

  for (let i = 0; i < comDoi.length; i += LOTE) {
    const fatia = comDoi.slice(i, i + LOTE);
    const url = 'https://api.openalex.org/works?filter=doi:'
      + fatia.map((a) => encodeURIComponent(a.sinais.doi)).join('|')
      + '&per-page=' + LOTE
      + '&mailto=' + encodeURIComponent(process.env.EMAIL_CONTATO || 'biblioteca-ia@example.org');

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) { log('  [openalex/atualizar] HTTP ' + resp.status); continue; }
      const j = await resp.json();
      const porDoi = new Map((j.results || []).map((w) => [(w.doi || '').replace('https://doi.org/', ''), w]));

      for (const a of fatia) {
        const w = porDoi.get(a.sinais.doi);
        if (!w) continue;
        a.sinais = { ...a.sinais, citacoes: w.cited_by_count, ...sinaisDeCitacao(w) };
        atualizados++;
      }
    } catch (e) {
      log('  [openalex/atualizar] falhou: ' + e.message);
    }
  }
  log('  [openalex/atualizar] ' + atualizados + ' artigos com citacoes atualizadas');
  return atualizados;
}
