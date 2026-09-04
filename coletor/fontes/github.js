// Fonte: GitHub Search API. De longe a mais confiavel e barata de automatizar --
// sem scraping, sem ToS cinzento, 5000 req/h com o GITHUB_TOKEN que o Actions ja da.
// Alimenta sobretudo tipo="projeto_oss".

const TOPICOS = [
  'llm', 'ai-agents', 'rag', 'generative-ai', 'computer-vision',
  'speech-recognition', 'llmops', 'ai-tools', 'multimodal',
];

const MIN_ESTRELAS = 300;
const JANELA_DIAS = 120; // so repos com push recente: filtra projeto morto

export const nome = 'github';

export async function coletar({ limitePorTopico = 15, log = console.log } = {}) {
  const token = process.env.GITHUB_TOKEN;
  const cabecalhos = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'biblioteca-ia-coletor',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const corte = new Date(Date.now() - JANELA_DIAS * 864e5).toISOString().slice(0, 10);
  const encontrados = new Map();

  for (const topico of TOPICOS) {
    const q = `topic:${topico} stars:>${MIN_ESTRELAS} pushed:>${corte}`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}`
      + `&sort=stars&order=desc&per_page=${limitePorTopico}`;

    const resp = await fetch(url, { headers: cabecalhos });
    if (!resp.ok) {
      log(`  [github] topico "${topico}" falhou: ${resp.status} ${resp.statusText}`);
      if (resp.status === 403) log('  [github] provavel rate limit -- defina GITHUB_TOKEN');
      continue;
    }

    const { items = [] } = await resp.json();
    for (const repo of items) {
      if (!repo.description) continue; // sem descricao o LLM nao tem o que classificar
      if (repo.archived) continue;

      encontrados.set(repo.html_url, {
        nome: repo.name,
        url: repo.html_url,
        descricao: `${repo.description}\nTopicos: ${(repo.topics || []).join(', ')}\nLinguagem: ${repo.language || 'n/d'}`,
        fonte_url: repo.html_url,
        sinais: {
          estrelas: repo.stargazers_count,
          forks: repo.forks_count,
          ultimo_push: repo.pushed_at?.slice(0, 10),
        },
      });
    }
    log(`  [github] ${topico}: ${items.length} repos`);
    await new Promise((r) => setTimeout(r, 1200)); // respeita o rate limit de busca
  }

  return [...encontrados.values()];
}
