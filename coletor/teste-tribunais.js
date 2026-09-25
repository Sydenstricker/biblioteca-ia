// Teste de fumaca do hub "IA em Tribunais", sem navegador.
// Reaproveita o DOM minimo de dom-falso.js e exercita as quatro vistas.
//
//   node coletor/teste-tribunais.js

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { montarDom, Elemento } from './dom-falso.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const porId = montarDom([
  'filtros', 'busca', 'saida', 'contagem', 'limpar', 'vazio', 'tema',
  'explicacao', 'rodape-info', 'n-aplicacoes', 'n-noticias', 'n-artigos', 'ordem-artigo',
]);

// As abas nao tem id: sao consultadas por '.aba'. Registramos as quatro a mao.
// O guia e a primeira e a ativa por padrao -- e a porta de entrada do hub.
const NOMES_ABAS = ['guia', 'aplicacoes', 'noticias', 'artigos'];
const abas = NOMES_ABAS.map((v) => {
  const el = new Elemento('button');
  el.className = 'aba' + (v === 'guia' ? ' ativa' : '');
  el.dataset.vista = v;
  return el;
});
const aba = (nome) => abas[NOMES_ABAS.indexOf(nome)];

const querySelectorAllOriginal = globalThis.document.querySelectorAll;
globalThis.document.querySelectorAll = (sel) => {
  if (sel === '.aba') return abas;
  return querySelectorAllOriginal(sel);
};

globalThis.fetch = async (caminho) => ({
  ok: true,
  json: async () => JSON.parse(readFileSync(join(RAIZ, caminho), 'utf8')),
});

await import(pathToFileURL(join(RAIZ, 'assets', 'tribunais.js')).href);
await new Promise((r) => setTimeout(r, 80));

const ler = (p) => JSON.parse(readFileSync(join(RAIZ, p), 'utf8'));
const aplicacoes = ler('data/tribunais/aplicacoes.json');
const guia = ler('data/tribunais/guia.json');
const todosUsos = () => guia.grupos.flatMap((g) => g.usos);
const totalUsos = () => todosUsos().length;

let passou = 0;
function ok(nome, fn) {
  try { fn(); console.log('  ok  ' + nome); passou++; }
  catch (e) { console.log('  FALHOU  ' + nome + '\n      ' + e.message); process.exitCode = 1; }
}

const fichas = () => porId.saida.buscarTodos('ficha');
const cartoesUso = () => porId.saida.buscarTodos('cartao-uso');
const perguntas = () => porId.saida.buscarTodos('faq-item');

console.log('teste de fumaca do hub IA em Tribunais\n');

// ---------- o guia, que e a vista padrao ----------

ok('abre no guia, nao na grade de fichas', () => {
  assert.equal(porId.saida.className, 'lista-guia');
  assert.equal(fichas().length, 0, 'a vista inicial nao deve renderizar fichas');
});

ok('renderiza um cartao por uso e um bloco por pergunta', () => {
  assert.equal(cartoesUso().length, totalUsos());
  assert.equal(perguntas().length, guia.faq.perguntas.length);
});

ok('todo cartao traz esquema, ganho e cuidado', () => {
  for (const c of cartoesUso()) {
    assert.equal(c.buscarTodos('arte').length, 1, 'cartao sem esquema');
    assert.equal(c.buscarTodos('ganho').length, 1, 'cartao sem ganho');
    assert.equal(c.buscarTodos('cuidado').length, 1, 'cartao sem secao de cuidado');
  }
});

ok('os esquemas SVG sao desenhados de fato', () => {
  for (const c of cartoesUso()) {
    const arte = c.buscarTodos('arte')[0];
    assert.match(arte.innerHTML, /^<svg/, 'esquema ausente ou nome de icone invalido');
    assert.match(arte.innerHTML, /viewBox/, 'SVG sem viewBox');
  }
});

// A escolha editorial mais importante do guia: nada de robo nem juiz de metal.
ok('nenhum esquema usa iconografia de robo', () => {
  const tudo = cartoesUso().map((c) => c.buscarTodos('arte')[0].innerHTML).join(' ').toLowerCase();
  for (const proibido of ['robot', 'robo', 'android', 'cyborg', 'brain', 'cerebro']) {
    assert.ok(!tudo.includes(proibido), 'esquema contem referencia a "' + proibido + '"');
  }
});

ok('a barra lateral some e a coluna colapsa no guia', () => {
  assert.equal(porId.filtros.innerHTML, '');
  assert.ok(porId._main.classList.has('sem-filtros'), 'main deveria ter a classe sem-filtros');
});

ok('toda resposta do FAQ tem texto', () => {
  for (const p of guia.faq.perguntas) {
    assert.ok(p.resposta.length > 0, p.pergunta + ' esta sem resposta');
    for (const par of p.resposta) assert.ok(par.length > 40, p.pergunta + ' tem paragrafo curto demais');
  }
});

ok('as fontes do FAQ sao URLs validas', () => {
  for (const p of guia.faq.perguntas) {
    for (const f of p.fontes || []) {
      assert.match(f.url, /^https?:\/\//, p.pergunta + ' tem fonte sem URL valida');
      assert.ok(f.veiculo?.length > 2, p.pergunta + ' tem fonte sem veiculo');
    }
  }
});

ok('todo cartao aponta para uma aplicacao existente na taxonomia', () => {
  const validas = ler('taxonomia-tribunais.json').aplicacoes.valores;
  for (const u of todosUsos()) {
    assert.ok(validas.includes(u.aplicacao), u.titulo + ': "' + u.aplicacao + '" fora da taxonomia');
  }
});

// A distincao entre "a IA que voce usa" e "a que chega ate voce" e a espinha do
// guia. Se alguem colapsar os dois grupos num so, isto aqui reclama.
ok('os dois grupos existem e sao visualmente distintos', () => {
  assert.equal(guia.grupos.length, 2, 'o guia precisa dos dois sentidos');
  const ids = guia.grupos.map((g) => g.id);
  assert.deepEqual(ids, ['usa', 'chega']);
  assert.ok(porId.saida.buscarTodos('g-usa').length === 1, 'secao do grupo "usa" ausente');
  assert.ok(porId.saida.buscarTodos('g-chega').length === 1, 'secao do grupo "chega" ausente');
});

ok('os cartoes do grupo "chega" dizem como reagir, nao como usar', () => {
  for (const u of guia.grupos.find((g) => g.id === 'chega').usos) {
    assert.ok(u.rotuloCuidado, u.titulo + ' deveria ter rotulo proprio de reacao');
    assert.ok(!/Onde tomar cuidado/.test(u.rotuloCuidado), u.titulo + ' usa rotulo de ferramenta');
  }
});

// A busca no guia foi adicionada porque o usuario procurou "texto branco" e nao
// achou nada: a caixa aparecia (o hidden era sobreposto por display:flex) mas o
// guia nem passava pela filtragem.
ok('buscar no guia encontra o cartao e a pergunta certos', () => {
  porId.busca.disparar('input', { target: { value: 'texto branco' } });
});

await new Promise((r) => setTimeout(r, 200));
ok('"texto branco" traz o comando oculto, e so ele', () => {
  const titulos = cartoesUso().map((c) => c.textContent);
  assert.equal(cartoesUso().length, 1, 'esperava exatamente 1 cartao');
  assert.ok(titulos[0].includes('Comando escondido'), 'cartao errado: ' + titulos[0]);
  assert.equal(perguntas().length, 1, 'esperava exatamente 1 pergunta');
});

ok('a resposta do FAQ ja vem aberta quando ha busca', () => {
  assert.equal(perguntas()[0].open, true, 'obrigar mais um clique anula a busca');
});

ok('busca sem resultado mostra estado vazio proprio', () => {
  porId.busca.disparar('input', { target: { value: 'xyzabc123' } });
});

await new Promise((r) => setTimeout(r, 200));
ok('nada encontrado no guia avisa em vez de ficar em branco', () => {
  assert.equal(cartoesUso().length, 0);
  assert.equal(perguntas().length, 0);
  assert.ok(porId.saida.buscarTodos('vazio').length === 1, 'faltou o aviso de nada encontrado');
});

ok('limpar a busca restaura o guia inteiro', () => {
  porId.limpar.disparar('click');
  assert.equal(cartoesUso().length, totalUsos());
  assert.equal(perguntas().length, guia.faq.perguntas.length);
});

// ---------- as vistas de dados ----------

aba('aplicacoes').disparar('click');

ok('trocar para aplicacoes renderiza uma ficha por item', () => {
  assert.equal(fichas().length, aplicacoes.length);
  assert.ok(!porId._main.classList.has('sem-filtros'), 'a barra lateral deveria voltar');
});

ok('a contagem das abas bate com os arquivos', () => {
  assert.equal(porId['n-aplicacoes'].textContent, String(aplicacoes.length));
});

ok('toda ficha exibe selo de verificacao', () => {
  for (const f of fichas()) assert.equal(f.buscarTodos('selo-verif').length, 1, 'ficha sem selo');
});

ok('o item desmentido recebe tratamento visual proprio', () => {
  const desmentidas = fichas().filter((f) => f.classList.has('desmentida'));
  const esperado = aplicacoes.filter((a) => a.verificacao === 'desmentido').length;
  assert.equal(desmentidas.length, esperado);
  assert.ok(esperado > 0, 'a semente precisa conter ao menos um caso desmentido');
});

ok('toda aplicacao tem ao menos uma fonte com link', () => {
  for (const a of aplicacoes) {
    assert.ok(a.fontes?.length > 0, a.nome + ' esta sem fonte');
    for (const f of a.fontes) assert.match(f.url, /^https?:\/\//, a.nome + ' tem fonte sem URL valida');
  }
});

ok('a controversia so aparece quando existe', () => {
  const comTexto = aplicacoes.filter((a) => a.controversia).length;
  assert.equal(fichas().filter((f) => f.buscarTodos('controversia').length).length, comTexto);
});

ok('busca textual sem acento encontra item acentuado', () => {
  porId.busca.value = 'judiciario';
  porId.busca.disparar('input', { target: { value: 'judiciario' } });
});

await new Promise((r) => setTimeout(r, 200));
ok('a busca filtrou de fato', () => {
  assert.ok(fichas().length > 0, 'busca sem acento nao casou nada');
  assert.ok(fichas().length <= aplicacoes.length);
});

ok('limpar restaura tudo', () => {
  porId.limpar.disparar('click');
  assert.equal(fichas().length, aplicacoes.length);
});

ok('aba de noticias nao quebra', () => {
  aba('noticias').disparar('click');
  assert.match(porId.explicacao.textContent, /Cobertura recente/);
  assert.equal(porId.saida.className, 'lista-noticias');
});

ok('aba de artigos nao quebra', () => {
  aba('artigos').disparar('click');
  assert.equal(porId.saida.className, 'lista-artigos');
});

const artigos = ler('data/tribunais/artigos.json');
const cartoesArtigo = () => porId.saida.buscarTodos('artigo');

ok('a aba de artigos mostra o seletor de ordenacao', () => {
  assert.equal(porId['ordem-artigo'].hidden, false, 'seletor deveria aparecer em artigos');
  assert.equal(porId['ordem-artigo'].filhos.length, 4, 'esperava 4 ordenacoes');
});

ok('ordenar por citacoes poe o mais citado primeiro', () => {
  porId['ordem-artigo'].value = 'citados';
  porId['ordem-artigo'].disparar('change', { target: { value: 'citados' } });
  const max = Math.max(...artigos.map((a) => a.sinais?.citacoes ?? 0));
  assert.ok(cartoesArtigo()[0].textContent.includes(String(max)), 'primeiro nao e o mais citado');
});

ok('ordenar por ascensao poe o de maior aceleracao primeiro', () => {
  porId['ordem-artigo'].disparar('change', { target: { value: 'ascensao' } });
  const comAcel = artigos.filter((a) => a.sinais?.aceleracao);
  assert.ok(comAcel.length > 0, 'a base precisa ter artigos com aceleracao medida');
  const topo = comAcel.sort((a, b) => b.sinais.aceleracao - a.sinais.aceleracao)[0];
  assert.ok(cartoesArtigo()[0].textContent.includes(topo.nome.slice(0, 30)), 'topo errado');
});

ok('so o artigo em ascensao ganha selo', () => {
  const comSelo = cartoesArtigo().filter((c) => c.buscarTodos('selo-ascensao').length);
  const esperado = artigos.filter((a) => a.sinais?.aceleracao >= 1.4).length;
  assert.equal(comSelo.length, esperado);
  assert.ok(esperado > 0, 'a base precisa ter ao menos um artigo em ascensao');
});

ok('voltar ao guia re-renderiza o conteudo didatico', () => {
  aba('guia').disparar('click');
  assert.equal(cartoesUso().length, totalUsos());
});

ok('o carimbo da ultima rodada aparece no rodape do hub', () => {
  const texto = porId['rodape-info'].textContent;
  assert.match(texto, /^Atualizado em [0-9]{1,2} de [a-zc]+ de [0-9]{4}$/,
    'rodape ficou "' + texto + '" -- carimbo.js nao escreveu, ou mudou de formato');
});

console.log('\n' + passou + ' verificacoes passaram');
