// Biblioteca de IA -- toda a logica roda no navegador sobre um JSON estatico.
// Sem build, sem framework, sem backend.

const CAMPOS_FILTRO = [
  { chave: 'tipo', rotulo: 'Tipo', dim: 'tipo', multi: false, url: 't' },
  { chave: 'industrias', rotulo: 'Indústria', dim: 'industrias', multi: true, url: 'i' },
  { chave: 'funcoes', rotulo: 'Função', dim: 'funcoes', multi: true, url: 'f' },
  { chave: 'modalidades', rotulo: 'Modalidade', dim: 'modalidades', multi: true, url: 'm' },
  { chave: 'implementacao', rotulo: 'Implementação', dim: 'implementacao', multi: false, url: 'e' },
  { chave: 'maturidade', rotulo: 'Maturidade', dim: 'maturidade', multi: false, url: 'x' },
];

const estado = {
  itens: [],
  taxonomia: null,
  rotulosTipo: {},
  selecao: Object.fromEntries(CAMPOS_FILTRO.map((c) => [c.chave, new Set()])),
  busca: '',
  ordem: 'tendencia',
};

const $ = (sel) => document.querySelector(sel);

/** Minusculas sem acento -- usado tanto na busca quanto na indexacao. */
const normalizar = (s) => (s || '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// ---------- carga ----------

async function carregar() {
  const [itens, taxonomia] = await Promise.all([
    fetch('data/itens.json').then((r) => r.json()),
    fetch('taxonomia.json').then((r) => r.json()),
  ]);

  estado.itens = itens.filter((i) => i.status !== 'descontinuado');
  estado.taxonomia = taxonomia;
  estado.rotulosTipo = Object.fromEntries(taxonomia.tipo.valores.map((v) => [v.id, v.rotulo]));

  for (const item of estado.itens) {
    item._indice = normalizar([
      item.nome, item.resumo, item.dominio,
      ...(item.industrias || []), ...(item.funcoes || []), ...(item.modalidades || []),
      item.implementacao, item.maturidade,
    ].join(' '));
  }

  lerUrl();
  montarFiltros();
  aplicar();
}

// ---------- estado na URL (links compartilhaveis) ----------

function lerUrl() {
  const p = new URLSearchParams(location.search);
  for (const campo of CAMPOS_FILTRO) {
    const bruto = p.get(campo.url);
    if (bruto) estado.selecao[campo.chave] = new Set(bruto.split('~').filter(Boolean));
  }
  estado.busca = p.get('q') || '';
  estado.ordem = p.get('o') || 'tendencia';
  $('#busca').value = estado.busca;
  $('#ordem').value = estado.ordem;
}

function escreverUrl() {
  const p = new URLSearchParams();
  for (const campo of CAMPOS_FILTRO) {
    const s = estado.selecao[campo.chave];
    if (s.size) p.set(campo.url, [...s].join('~'));
  }
  if (estado.busca) p.set('q', estado.busca);
  if (estado.ordem !== 'tendencia') p.set('o', estado.ordem);
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// ---------- filtragem ----------

/** Um item casa com o campo se tiver ao menos um dos valores marcados (OU dentro da dimensão). */
function casaCampo(item, campo) {
  const sel = estado.selecao[campo.chave];
  if (!sel.size) return true;
  const valor = item[campo.chave];
  return Array.isArray(valor) ? valor.some((v) => sel.has(v)) : sel.has(valor);
}

/** Dimensões diferentes se combinam por E. */
function filtrar(ignorandoCampo = null) {
  const termos = normalizar(estado.busca).split(/\s+/).filter(Boolean);
  return estado.itens.filter((item) => {
    for (const campo of CAMPOS_FILTRO) {
      if (campo.chave === ignorandoCampo) continue;
      if (!casaCampo(item, campo)) return false;
    }
    return termos.every((t) => item._indice.includes(t));
  });
}

/** Sinal de tendência: menções recentes pesam mais que popularidade absoluta. */
function pontuarTendencia(item) {
  const s = item.sinais || {};
  const diasDesdeVisto = (Date.now() - Date.parse(item.ultima_verificacao || 0)) / 864e5;
  const frescor = Math.max(0, 1 - diasDesdeVisto / 90);
  const popularidade = Math.log10(1 + (s.estrelas || 0) + (s.pontos_hn || 0) * 20);
  return (item.mencoes || 1) * 2 + frescor * 5 + popularidade;
}

function ordenar(lista) {
  const copia = [...lista];
  if (estado.ordem === 'alfabetica') return copia.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  if (estado.ordem === 'recentes') {
    return copia.sort((a, b) => (b.primeira_aparicao || '').localeCompare(a.primeira_aparicao || ''));
  }
  return copia.sort((a, b) => pontuarTendencia(b) - pontuarTendencia(a));
}

// ---------- render ----------

function montarFiltros() {
  const alvo = $('#filtros');
  alvo.innerHTML = '';

  for (const campo of CAMPOS_FILTRO) {
    const dim = estado.taxonomia[campo.dim];
    const valores = campo.dim === 'tipo' ? dim.valores.map((v) => v.id) : dim.valores;

    const grupo = document.createElement('div');
    grupo.className = 'grupo-filtro';
    grupo.innerHTML = '<h2>' + campo.rotulo + '</h2>';

    for (const valor of valores) {
      const rotulo = document.createElement('label');
      rotulo.className = 'opcao';
      rotulo.dataset.campo = campo.chave;
      rotulo.dataset.valor = valor;

      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.checked = estado.selecao[campo.chave].has(valor);
      caixa.addEventListener('change', () => {
        const sel = estado.selecao[campo.chave];
        // Dimensões de valor único se comportam como rádio: marcar uma desmarca a outra.
        if (!campo.multi && caixa.checked) sel.clear();
        caixa.checked ? sel.add(valor) : sel.delete(valor);
        montarFiltros();
        aplicar();
      });

      const texto = document.createElement('span');
      texto.textContent = campo.dim === 'tipo' ? estado.rotulosTipo[valor] : valor;

      const n = document.createElement('span');
      n.className = 'n';

      rotulo.append(caixa, texto, n);
      grupo.append(rotulo);
    }
    alvo.append(grupo);
  }
  atualizarContagens();
}

/** Contagem por faceta calculada ignorando a própria dimensão -- senão tudo vira 0 ou 1. */
function atualizarContagens() {
  for (const campo of CAMPOS_FILTRO) {
    const base = filtrar(campo.chave);
    const contagem = new Map();
    for (const item of base) {
      const valor = item[campo.chave];
      for (const v of Array.isArray(valor) ? valor : [valor]) {
        if (v) contagem.set(v, (contagem.get(v) || 0) + 1);
      }
    }
    for (const el of document.querySelectorAll('.opcao[data-campo="' + campo.chave + '"]')) {
      const n = contagem.get(el.dataset.valor) || 0;
      el.querySelector('.n').textContent = n || '';
      el.classList.toggle('zerada', n === 0);
    }
  }
}

function cartao(item) {
  const el = document.createElement('article');
  el.className = 'cartao';

  const tags = [...(item.industrias || []), ...(item.funcoes || []), ...(item.modalidades || [])];
  const s = item.sinais || {};
  const metricas = [
    s.estrelas ? '★ ' + s.estrelas.toLocaleString('pt-BR') : '',
    s.pontos_hn ? '▲ ' + s.pontos_hn + ' HN' : '',
    item.mencoes > 1 ? item.mencoes + '× visto' : '',
    item.dominio,
  ].filter(Boolean);

  const cabecalho = document.createElement('div');
  cabecalho.className = 'cartao-topo';

  const h3 = document.createElement('h3');
  const link = document.createElement('a');
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = item.nome;
  h3.append(link);

  const selo = document.createElement('span');
  selo.className = 'selo';
  selo.textContent = item.implementacao;

  cabecalho.append(h3, selo);

  const resumo = document.createElement('p');
  resumo.className = 'resumo';
  resumo.textContent = item.resumo;

  const caixaTags = document.createElement('div');
  caixaTags.className = 'tags';
  for (const t of tags) {
    const b = document.createElement('button');
    b.className = 'tag';
    b.textContent = t;
    b.addEventListener('click', () => selecionarTag(t));
    caixaTags.append(b);
  }

  const rodape = document.createElement('div');
  rodape.className = 'rodape-cartao';
  rodape.textContent = metricas.join('  ·  ');
  if (item.confianca < 0.5) {
    const aviso = document.createElement('span');
    aviso.className = 'aviso-confianca';
    aviso.textContent = '⚠ classificação incerta';
    rodape.append(' ', aviso);
  }

  el.append(cabecalho, resumo, caixaTags, rodape);
  return el;
}

/** Clicar numa tag do cartão marca o filtro correspondente, seja qual for a dimensão. */
function selecionarTag(valor) {
  for (const campo of CAMPOS_FILTRO) {
    const dim = estado.taxonomia[campo.dim];
    const valores = campo.dim === 'tipo' ? dim.valores.map((v) => v.id) : dim.valores;
    if (valores.includes(valor)) {
      if (!campo.multi) estado.selecao[campo.chave].clear();
      estado.selecao[campo.chave].add(valor);
      montarFiltros();
      aplicar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
  }
}

function aplicar() {
  const resultado = ordenar(filtrar());
  const grade = $('#grade');
  grade.innerHTML = '';

  const fragmento = document.createDocumentFragment();
  for (const item of resultado) fragmento.append(cartao(item));
  grade.append(fragmento);

  const total = estado.itens.length;
  $('#contagem').textContent = resultado.length === total
    ? total + ' itens no acervo'
    : resultado.length + ' de ' + total + ' itens';

  const ativos = CAMPOS_FILTRO.some((c) => estado.selecao[c.chave].size) || estado.busca;
  $('#limpar').hidden = !ativos;
  $('#vazio').hidden = resultado.length > 0;

  atualizarContagens();
  escreverUrl();
}

// ---------- eventos ----------

let temporizador;
$('#busca').addEventListener('input', (e) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { estado.busca = e.target.value.trim(); aplicar(); }, 130);
});

$('#ordem').addEventListener('change', (e) => { estado.ordem = e.target.value; aplicar(); });

$('#limpar').addEventListener('click', () => {
  for (const c of CAMPOS_FILTRO) estado.selecao[c.chave].clear();
  estado.busca = '';
  $('#busca').value = '';
  montarFiltros();
  aplicar();
});

$('#tema').addEventListener('click', () => {
  const escuro = document.documentElement.dataset.tema === 'escuro';
  document.documentElement.dataset.tema = escuro ? 'claro' : 'escuro';
  try { localStorage.setItem('tema', document.documentElement.dataset.tema); } catch { /* modo privado */ }
});

try {
  const salvo = localStorage.getItem('tema');
  if (salvo) document.documentElement.dataset.tema = salvo;
  else if (matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.dataset.tema = 'escuro';
} catch { /* localStorage indisponivel -- segue no tema claro */ }

carregar().catch((e) => {
  $('#grade').innerHTML = '<div class="vazio"><p><strong>Não consegui carregar o acervo.</strong></p>'
    + '<p>' + e.message + '</p></div>';
});
