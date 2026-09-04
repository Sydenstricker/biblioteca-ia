// Hub "IA em Tribunais". Tres colecoes com ciclos de vida diferentes, tres layouts:
// aplicacao e ficha, noticia e fluxo cronologico, artigo e referencia por citacao.

import { diagrama } from './diagramas.js';

const VISTAS = {
  // A porta de entrada. Quem chega aqui costuma nao saber ainda o que procurar --
  // as outras tres abas sao referencia, e so servem a quem ja sabe.
  guia: {
    arquivo: 'data/tribunais/guia.json',
    filtros: [],
    estatico: true,
    explicacao: '',
  },
  aplicacoes: {
    arquivo: 'data/tribunais/aplicacoes.json',
    filtros: ['paises', 'orgaos', 'aplicacoes', 'fases', 'verificacao'],
    explicacao: 'Sistemas de IA em uso (ou anunciados) por órgãos de justiça. Cada ficha traz a procedência da informação — este é um domínio em que afirmação sem fonte circula com facilidade.',
  },
  noticias: {
    arquivo: 'data/tribunais/noticias.json',
    filtros: ['temas', 'paises', 'orgaos'],
    explicacao: 'Cobertura recente sobre IA no Judiciário, da mais nova para a mais antiga. Coletada automaticamente e classificada; notícias com mais de 18 meses saem do acervo.',
  },
  artigos: {
    arquivo: 'data/tribunais/artigos.json',
    filtros: ['temas', 'paises'],
    ordenavel: true,
    explicacao: 'Produção acadêmica sobre IA e sistemas de justiça, do OpenAlex e do arXiv. Use a ordenação para separar os clássicos consolidados dos trabalhos que estão ganhando tração agora.',
  },
};

const ROTULOS = {
  paises: 'País', orgaos: 'Órgão', aplicacoes: 'Aplicação',
  fases: 'Fase processual', verificacao: 'Verificação', temas: 'Tema',
};

/**
 * Ordenacoes da aba de artigos. Cada uma responde a uma pergunta diferente:
 *
 *   citados     o que a area ja consagrou. Favorece o antigo, por construcao.
 *   ascensao    o que esta subindo AGORA -- ultimo ano completo contra a media
 *               dos anteriores. Pega ate obra antiga sendo redescoberta.
 *   velocidade  citacoes por ano desde a publicacao. Normaliza a idade, entao um
 *               trabalho de 2024 nao e punido por ter tido menos tempo.
 *   recentes    simplesmente o mais novo primeiro.
 */
const ORDENS_ARTIGO = {
  citados: { rotulo: 'Mais citados', chave: (a) => a.sinais?.citacoes ?? 0 },
  ascensao: { rotulo: 'Em ascensão', chave: (a) => a.sinais?.aceleracao ?? -1 },
  velocidade: { rotulo: 'Citações por ano', chave: (a) => a.sinais?.velocidade ?? 0 },
  recentes: { rotulo: 'Mais recentes', chave: (a) => a.sinais?.ano ?? 0 },
};

/** A partir daqui o artigo ganha selo de destaque: cresceu 40% sobre a media. */
const LIMIAR_ASCENSAO = 1.4;

const estado = {
  vista: 'guia', dados: {}, taxonomia: null, selecao: {}, busca: '', ordemArtigo: 'citados',
};

const $ = (s) => document.querySelector(s);
const normalizar = (s) => (s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Rotulos legiveis para dimensoes cujos valores sao ids. */
function rotuloValor(dim, valor) {
  const d = estado.taxonomia[dim];
  if (!d) return valor;
  const achado = Array.isArray(d.valores)
    ? d.valores.find((v) => typeof v === 'object' && v.id === valor)
    : null;
  return achado ? achado.rotulo : valor;
}

function valoresDe(dim) {
  const d = estado.taxonomia[dim];
  if (!d) return [];
  return d.valores.map((v) => (typeof v === 'object' ? v.id : v));
}

// ---------- carga ----------

async function carregar() {
  estado.taxonomia = await fetch('taxonomia-tribunais.json').then((r) => r.json());

  for (const [nome, cfg] of Object.entries(VISTAS)) {
    try {
      estado.dados[nome] = await fetch(cfg.arquivo).then((r) => (r.ok ? r.json() : []));
    } catch {
      estado.dados[nome] = [];
    }
    // O guia e um objeto de conteudo, nao uma colecao: sem indice e sem contador.
    if (cfg.estatico) continue;

    for (const item of estado.dados[nome]) {
      item._indice = normalizar([
        item.nome, item.resumo, item.o_que_faz, item.orgao, item.controversia,
        ...(item.paises || []), ...(item.orgaos || []), ...(item.aplicacoes || []),
        ...(item.temas || []), ...(item.fases || []),
        ...(item.sinais?.autores || []), item.sinais?.veiculo,
      ].join(' '));
    }
    $('#n-' + nome).textContent = estado.dados[nome].length;
  }

  lerUrl();
  trocarVista(estado.vista, true);
}

function lerUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('v') && VISTAS[p.get('v')]) estado.vista = p.get('v');
  estado.busca = p.get('q') || '';
  $('#busca').value = estado.busca;
  for (const dim of Object.keys(ROTULOS)) {
    const v = p.get(dim);
    if (v) estado.selecao[dim] = new Set(v.split('~').filter(Boolean));
  }
}

function escreverUrl() {
  const p = new URLSearchParams();
  if (estado.vista !== 'guia') p.set('v', estado.vista);
  if (estado.busca) p.set('q', estado.busca);
  for (const [dim, sel] of Object.entries(estado.selecao)) {
    if (sel?.size && VISTAS[estado.vista].filtros.includes(dim)) p.set(dim, [...sel].join('~'));
  }
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// ---------- filtragem ----------

function filtrar(ignorando = null) {
  const itens = estado.dados[estado.vista] || [];
  const dims = VISTAS[estado.vista].filtros;
  const termos = normalizar(estado.busca).split(/\s+/).filter(Boolean);

  return itens.filter((item) => {
    for (const dim of dims) {
      if (dim === ignorando) continue;
      const sel = estado.selecao[dim];
      if (!sel?.size) continue;
      const valor = item[dim];
      const lista = Array.isArray(valor) ? valor : [valor];
      if (!lista.some((v) => sel.has(v))) return false;
    }
    return termos.every((t) => item._indice.includes(t));
  });
}

/**
 * Só a aba de artigos reordena. As outras já vêm na ordem certa do coletor:
 * notícia por data, aplicação por id.
 */
function ordenar(lista) {
  if (estado.vista !== 'artigos') return lista;
  const ordem = ORDENS_ARTIGO[estado.ordemArtigo] || ORDENS_ARTIGO.citados;
  return [...lista].sort((a, b) => ordem.chave(b) - ordem.chave(a));
}

// ---------- render ----------

function montarFiltros() {
  const alvo = $('#filtros');
  alvo.innerHTML = '';

  for (const dim of VISTAS[estado.vista].filtros) {
    const grupo = document.createElement('div');
    grupo.className = 'grupo-filtro';
    grupo.innerHTML = '<h2>' + ROTULOS[dim] + '</h2>';

    const base = filtrar(dim);
    let opcoesAdicionadas = 0;
    for (const valor of valoresDe(dim)) {
      const n = base.filter((i) => {
        const v = i[dim];
        return Array.isArray(v) ? v.includes(valor) : v === valor;
      }).length;
      // Numa colecao pequena, listar dezenas de opcoes zeradas so atrapalha.
      if (n === 0 && !estado.selecao[dim]?.has(valor)) continue;

      const rotulo = document.createElement('label');
      rotulo.className = 'opcao';
      rotulo.dataset.campo = dim;
      rotulo.dataset.valor = valor;

      const caixa = document.createElement('input');
      caixa.type = 'checkbox';
      caixa.checked = !!estado.selecao[dim]?.has(valor);
      caixa.addEventListener('change', () => {
        estado.selecao[dim] ||= new Set();
        caixa.checked ? estado.selecao[dim].add(valor) : estado.selecao[dim].delete(valor);
        aplicar();
      });

      const txt = document.createElement('span');
      txt.textContent = rotuloValor(dim, valor);
      const cont = document.createElement('span');
      cont.className = 'n';
      cont.textContent = n;

      rotulo.append(caixa, txt, cont);
      grupo.append(rotulo);
      opcoesAdicionadas++;
    }
    // Uma dimensao sem nenhuma opcao util nao vira secao vazia na barra lateral.
    if (opcoesAdicionadas > 0) alvo.append(grupo);
  }
}

function selo(verificacao, motivo) {
  const el = document.createElement('span');
  el.className = 'selo-verif v-' + verificacao;
  el.textContent = rotuloValor('verificacao', verificacao);
  const ajuda = estado.taxonomia.verificacao.valores.find((v) => v.id === verificacao);
  // O motivo diz qual dominio decidiu, para a classificacao ser auditavel num passar de mouse.
  el.title = [ajuda?.ajuda, motivo].filter(Boolean).join('\n\n');
  return el;
}

function fichaAplicacao(item) {
  const el = document.createElement('article');
  el.className = 'ficha' + (item.verificacao === 'desmentido' ? ' desmentida' : '');

  const topo = document.createElement('div');
  topo.className = 'ficha-topo';
  const h3 = document.createElement('h3');
  h3.textContent = item.nome;
  topo.append(h3, selo(item.verificacao, item.verificacao_motivo));

  const meta = document.createElement('p');
  meta.className = 'ficha-meta';
  meta.textContent = [item.orgao, item.ano, item.situacao].filter(Boolean).join('  ·  ');

  const corpo = document.createElement('p');
  corpo.className = 'resumo';
  corpo.textContent = item.o_que_faz;

  el.append(topo, meta, corpo);

  if (item.controversia) {
    const c = document.createElement('div');
    c.className = 'controversia';
    c.innerHTML = '<strong>Controvérsia</strong>';
    const p = document.createElement('p');
    p.textContent = item.controversia;
    c.append(p);
    el.append(c);
  }

  const tags = document.createElement('div');
  tags.className = 'tags';
  for (const t of [...(item.aplicacoes || []), ...(item.fases || [])]) {
    const b = document.createElement('span');
    b.className = 'tag';
    b.textContent = t;
    tags.append(b);
  }
  el.append(tags);

  if (item.fontes?.length) {
    const f = document.createElement('div');
    f.className = 'fontes';
    f.append(document.createTextNode('Fontes: '));
    item.fontes.forEach((fo, i) => {
      if (i) f.append(document.createTextNode(' · '));
      const a = document.createElement('a');
      a.href = fo.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = fo.veiculo;
      f.append(a);
    });
    el.append(f);
  }
  return el;
}

function linhaNoticia(item) {
  const el = document.createElement('article');
  el.className = 'noticia';

  const data = document.createElement('time');
  data.className = 'noticia-data';
  const d = item.sinais?.data_publicacao || item.coletado_em || '';
  data.textContent = d ? d.split('-').reverse().join('/') : '';

  const corpo = document.createElement('div');
  const h3 = document.createElement('h3');
  const a = document.createElement('a');
  a.href = item.url; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = item.nome;
  h3.append(a);

  // Selo junto do veiculo: e na notícia que a regra de dominio mais trabalha,
  // distinguindo o comunicado do proprio tribunal da materia sobre ele.
  const meta = document.createElement('p');
  meta.className = 'ficha-meta linha-veiculo';
  meta.append(document.createTextNode(item.sinais?.veiculo || ''));
  if (item.verificacao) meta.append(selo(item.verificacao, item.verificacao_motivo));

  const p = document.createElement('p');
  p.className = 'resumo';
  p.textContent = item.resumo;

  const tags = document.createElement('div');
  tags.className = 'tags';
  for (const t of (item.temas || []).slice(0, 3)) {
    const b = document.createElement('span');
    b.className = 'tag';
    b.textContent = t;
    tags.append(b);
  }

  corpo.append(h3, meta, p, tags);
  el.append(data, corpo);
  return el;
}

function linhaArtigo(item) {
  const el = document.createElement('article');
  el.className = 'artigo';

  const h3 = document.createElement('h3');
  const a = document.createElement('a');
  a.href = item.url; a.target = '_blank'; a.rel = 'noopener';
  a.textContent = item.nome;
  h3.append(a);

  const s = item.sinais || {};

  // O selo de ascensao e o unico sinal do hub que muda sozinho a cada rodada:
  // depende da contagem de citacoes rebuscada no OpenAlex, nao do texto do artigo.
  if (s.aceleracao >= LIMIAR_ASCENSAO) {
    const selo = document.createElement('span');
    selo.className = 'selo-ascensao';
    selo.textContent = '↗ em ascensão';
    selo.title = 'Citações no último ano completo foram ' + s.aceleracao
      + '× a média dos anos anteriores'
      + (s.citacoes_ano_recente ? ' (' + s.citacoes_ano_recente + ' citações nesse ano)' : '');
    h3.append(' ', selo);
  }

  const meta = document.createElement('p');
  meta.className = 'ficha-meta';
  meta.textContent = [
    (s.autores || []).slice(0, 3).join('; ') + ((s.autores || []).length > 3 ? ' et al.' : ''),
    s.ano, s.veiculo,
  ].filter(Boolean).join('  ·  ');

  const p = document.createElement('p');
  p.className = 'resumo';
  p.textContent = item.resumo;

  const rodape = document.createElement('div');
  rodape.className = 'rodape-cartao';
  rodape.textContent = [
    s.citacoes != null ? s.citacoes + ' citações' : '',
    s.velocidade ? s.velocidade + '/ano' : '',
    s.acesso_aberto ? 'acesso aberto' : '',
    s.doi ? 'DOI ' + s.doi : '',
  ].filter(Boolean).join('  ·  ');

  el.append(h3, meta, p, rodape);
  return el;
}

/** Lista de fontes com links, reaproveitada por fichas e pelo FAQ. */
function listaFontes(fontes, rotulo = 'Fontes: ') {
  const f = document.createElement('div');
  f.className = 'fontes';
  f.append(document.createTextNode(rotulo));
  fontes.forEach((fo, i) => {
    if (i) f.append(document.createTextNode(' · '));
    const a = document.createElement('a');
    a.href = fo.url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = fo.veiculo;
    f.append(a);
  });
  return f;
}

function cartaoUso(uso) {
  const el = document.createElement('article');
  el.className = 'cartao-uso';

  const arte = document.createElement('div');
  arte.className = 'arte';
  arte.innerHTML = diagrama(uso.icone);

  const h3 = document.createElement('h3');
  h3.textContent = uso.titulo;

  const oQue = document.createElement('p');
  oQue.className = 'resumo';
  oQue.textContent = uso.oQueFaz;

  const ganho = document.createElement('p');
  ganho.className = 'ganho';
  ganho.textContent = uso.destaque;

  const cuidado = document.createElement('div');
  cuidado.className = 'cuidado';
  const rot = document.createElement('strong');
  // Cartao do grupo "chega" nao fala de cuidado ao usar, e sim de como reagir.
  rot.textContent = uso.rotuloCuidado || 'Onde tomar cuidado';
  const txt = document.createElement('p');
  txt.textContent = uso.cuidado;
  cuidado.append(rot, txt);

  el.append(arte, h3, oQue, ganho, cuidado);

  if (uso.exemplos?.length) {
    const usa = document.createElement('p');
    usa.className = 'quem-usa';
    usa.textContent = 'Já em uso: ' + uso.exemplos.join(', ');
    el.append(usa);
  }

  // O cartao didatico leva ao catalogo: clicar filtra as aplicacoes por esta funcao.
  if (uso.aplicacao) {
    const ver = document.createElement('button');
    ver.className = 'botao-texto ver-catalogo';
    ver.textContent = 'ver quem usa no catálogo →';
    ver.addEventListener('click', () => {
      estado.selecao.aplicacoes = new Set([uso.aplicacao]);
      trocarVista('aplicacoes');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    el.append(ver);
  }
  return el;
}

function blocoFaq(item) {
  const d = document.createElement('details');
  d.className = 'faq-item';

  const s = document.createElement('summary');
  s.textContent = item.pergunta;
  d.append(s);

  const corpo = document.createElement('div');
  corpo.className = 'faq-corpo';
  for (const par of item.resposta) {
    const p = document.createElement('p');
    p.textContent = par;
    corpo.append(p);
  }
  if (item.fontes?.length) corpo.append(listaFontes(item.fontes, 'Onde conferir: '));
  d.append(corpo);
  return d;
}

/** O guia nao e uma colecao filtravel: monta a pagina inteira de uma vez. */
function renderGuia(alvo) {
  const g = estado.dados.guia;
  if (!g?.grupos) {
    alvo.innerHTML = '<div class="vazio"><p>Guia indisponível.</p></div>';
    return;
  }

  const intro = document.createElement('section');
  intro.className = 'guia-intro';
  const h2 = document.createElement('h2');
  h2.textContent = g.abertura.titulo;
  const p = document.createElement('p');
  p.textContent = g.abertura.texto;
  intro.append(h2, p);
  alvo.append(intro);

  // Dois grupos com sentidos opostos: a IA que voce adota e a que chega ate voce.
  for (const grupo of g.grupos) {
    const sec = document.createElement('section');
    sec.className = 'grupo-usos g-' + grupo.id;

    const h = document.createElement('h2');
    h.textContent = grupo.titulo;
    const sub = document.createElement('p');
    sub.className = 'grupo-sub';
    sub.textContent = grupo.texto;
    sec.append(h, sub);

    const grade = document.createElement('div');
    grade.className = 'grade-usos';
    for (const uso of grupo.usos) grade.append(cartaoUso(uso));
    sec.append(grade);
    alvo.append(sec);
  }

  const faq = document.createElement('section');
  faq.className = 'guia-faq';
  const h2f = document.createElement('h2');
  h2f.textContent = g.faq.titulo;
  const aviso = document.createElement('p');
  aviso.className = 'aviso-faq';
  aviso.textContent = g.faq.aviso;
  faq.append(h2f, aviso);
  for (const item of g.faq.perguntas) faq.append(blocoFaq(item));

  alvo.append(faq);
}

const RENDER = { aplicacoes: fichaAplicacao, noticias: linhaNoticia, artigos: linhaArtigo };

function aplicar() {
  const saida = $('#saida');
  saida.innerHTML = '';
  saida.className = 'lista-' + estado.vista;

  // O guia e conteudo editorial: nada de filtro, contagem, busca ou estado vazio.
  const estatico = !!VISTAS[estado.vista].estatico;
  document.querySelector('main').classList.toggle('sem-filtros', estatico);

  if (estatico) {
    renderGuia(saida);
    $('#filtros').innerHTML = '';
    $('#contagem').textContent = '';
    $('#limpar').hidden = true;
    $('#vazio').hidden = true;
    escreverUrl();
    return;
  }

  const resultado = ordenar(filtrar());
  const frag = document.createDocumentFragment();
  for (const item of resultado) frag.append(RENDER[estado.vista](item));
  saida.append(frag);

  const total = (estado.dados[estado.vista] || []).length;
  $('#contagem').textContent = resultado.length === total
    ? total + ' registros'
    : resultado.length + ' de ' + total;
  $('#vazio').hidden = resultado.length > 0;

  const temFiltro = estado.busca
    || VISTAS[estado.vista].filtros.some((d) => estado.selecao[d]?.size);
  $('#limpar').hidden = !temFiltro;

  montarFiltros();
  escreverUrl();
}

function trocarVista(nome, inicial = false) {
  estado.vista = nome;
  for (const b of document.querySelectorAll('.aba')) {
    b.classList.toggle('ativa', b.dataset.vista === nome);
  }
  $('#explicacao').textContent = VISTAS[nome].explicacao;
  $('#explicacao').hidden = !VISTAS[nome].explicacao;
  // Buscar dentro do guia nao faz sentido: sao oito perguntas numa pagina so.
  $('#busca').closest('.busca-linha').hidden = !!VISTAS[nome].estatico;
  $('#ordem-artigo').hidden = !VISTAS[nome].ordenavel;
  if (!inicial) {
    // Filtros de uma vista nao fazem sentido na outra.
    for (const d of Object.keys(ROTULOS)) if (!VISTAS[nome].filtros.includes(d)) estado.selecao[d]?.clear();
  }
  aplicar();
}

// ---------- eventos ----------

for (const b of document.querySelectorAll('.aba')) {
  b.addEventListener('click', () => trocarVista(b.dataset.vista));
}

// O seletor de ordenacao e montado a partir de ORDENS_ARTIGO, para os rotulos nao
// viverem em dois lugares. Fica AQUI, no nivel do modulo, e nao em trocarVista():
// la dentro ele seria repovoado a cada troca de aba, acumulando opcoes repetidas e
// um ouvinte novo por vez.
{
  const sel = $('#ordem-artigo');
  for (const [id, o] of Object.entries(ORDENS_ARTIGO)) {
    const op = document.createElement('option');
    op.value = id;
    op.textContent = o.rotulo;
    sel.append(op);
  }
  sel.value = estado.ordemArtigo;
  sel.addEventListener('change', (e) => { estado.ordemArtigo = e.target.value; aplicar(); });
}

let temporizador;
$('#busca').addEventListener('input', (e) => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { estado.busca = e.target.value.trim(); aplicar(); }, 130);
});

$('#limpar').addEventListener('click', () => {
  for (const d of Object.keys(ROTULOS)) estado.selecao[d]?.clear();
  estado.busca = '';
  $('#busca').value = '';
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
} catch { /* indisponivel */ }

carregar().catch((e) => {
  $('#saida').innerHTML = '<div class="vazio"><p><strong>Não consegui carregar o hub.</strong></p><p>'
    + e.message + '</p></div>';
});
