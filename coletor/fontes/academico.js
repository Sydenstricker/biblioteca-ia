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

async function openAlex(log, limite) {
  const filtro = `title_and_abstract.search:(${TERMOS_IA}) AND (${TERMOS_JUSTICA})`;
  const url = 'https://api.openalex.org/works'
    + '?filter=' + encodeURIComponent(filtro) + ',from_publication_date:' + ANO_MINIMO + '-01-01'
    + '&per-page=' + limite
    + '&sort=cited_by_count:desc'
    // O OpenAlex pede um e-mail para entrar no "polite pool", com filas melhores.
    + '&mailto=' + encodeURIComponent(process.env.EMAIL_CONTATO || 'biblioteca-ia@example.org');

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) { log('  [openalex] HTTP ' + resp.status); return []; }
    const j = await resp.json();
    log('  [openalex] ' + j.results.length + ' de ' + j.meta.count + ' trabalhos');

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
  const consulta = 'all:("legal reasoning" OR "legal judgment prediction" OR "court" OR "judiciary") AND all:("large language model" OR "artificial intelligence")';
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
  const [a, b] = await Promise.all([openAlex(log, limite), arxiv(log, 15)]);
  const porUrl = new Map();
  for (const it of [...a, ...b]) if (it.url) porUrl.set(it.url, it);
  return [...porUrl.values()];
}
