// Fonte: Hacker News via API do Algolia. Sem chave, sem rate limit pratico.
// O sinal aqui e social (pontos), nao tecnico: pega o que a industria esta
// realmente discutindo. Alimenta "ferramenta" e "caso_de_uso".

const CONSULTAS = [
  'AI agent', 'LLM application', 'AI for healthcare', 'legal AI',
  'AI customer support', 'computer vision production', 'voice AI',
  'AI in finance', 'RAG production',
];

const MIN_PONTOS = 80;
const JANELA_DIAS = 45; // margem sobre o cron mensal: rodada atrasada nao abre buraco

export const nome = 'hackernews';

export async function coletar({ limitePorConsulta = 12, log = console.log } = {}) {
  const desde = Math.floor((Date.now() - JANELA_DIAS * 864e5) / 1000);
  const encontrados = new Map();

  for (const consulta of CONSULTAS) {
    const url = 'https://hn.algolia.com/api/v1/search'
      + `?query=${encodeURIComponent(consulta)}`
      + `&tags=story&numericFilters=points>${MIN_PONTOS},created_at_i>${desde}`
      + `&hitsPerPage=${limitePorConsulta}`;

    const resp = await fetch(url, { headers: { 'User-Agent': 'biblioteca-ia-coletor' } });
    if (!resp.ok) {
      log(`  [hn] consulta "${consulta}" falhou: ${resp.status}`);
      continue;
    }

    const { hits = [] } = await resp.json();
    for (const hit of hits) {
      // Sem URL externa e discussao pura (Ask HN) -- nao ha produto para catalogar.
      if (!hit.url) continue;

      encontrados.set(hit.url, {
        nome: hit.title.replace(/^(Show HN|Launch HN|Ask HN):\s*/i, '').split(/\s+[-–—]\s+/)[0].slice(0, 80),
        url: hit.url,
        descricao: `Titulo no HN: ${hit.title}\nContexto da busca: ${consulta}`,
        fonte_url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        sinais: {
          pontos_hn: hit.points,
          comentarios_hn: hit.num_comments,
          data_hn: hit.created_at?.slice(0, 10),
        },
      });
    }
    log(`  [hn] "${consulta}": ${hits.length} historias`);
  }

  return [...encontrados.values()];
}
