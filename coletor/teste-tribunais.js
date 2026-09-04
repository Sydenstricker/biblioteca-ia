// Teste de fumaca do hub "IA em Tribunais", sem navegador.
// Reaproveita o DOM minimo de teste-frontend.js e exercita as tres vistas.
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
  'explicacao', 'rodape-info', 'n-aplicacoes', 'n-noticias', 'n-artigos',
]);

// As abas nao tem id: sao consultadas por '.aba'. Registramos as tres a mao.
const abas = ['aplicacoes', 'noticias', 'artigos'].map((v) => {
  const el = new Elemento('button');
  el.className = 'aba' + (v === 'aplicacoes' ? ' ativa' : '');
  el.dataset.vista = v;
  return el;
});

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

const aplicacoes = JSON.parse(readFileSync(join(RAIZ, 'data/tribunais/aplicacoes.json'), 'utf8'));

let passou = 0;
function ok(nome, fn) {
  try { fn(); console.log('  ok  ' + nome); passou++; }
  catch (e) { console.log('  FALHOU  ' + nome + '\n      ' + e.message); process.exitCode = 1; }
}

const fichas = () => porId.saida.buscarTodos('ficha');

console.log('teste de fumaca do hub IA em Tribunais\n');

ok('renderiza uma ficha por aplicacao', () => {
  assert.equal(fichas().length, aplicacoes.length);
});

ok('a contagem das abas bate com os arquivos', () => {
  assert.equal(porId['n-aplicacoes'].textContent, String(aplicacoes.length));
});

ok('toda ficha exibe selo de verificacao', () => {
  for (const f of fichas()) {
    assert.equal(f.buscarTodos('selo-verif').length, 1, 'ficha sem selo de verificacao');
  }
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
  const renderizadas = fichas().filter((f) => f.buscarTodos('controversia').length).length;
  assert.equal(renderizadas, comTexto);
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

ok('trocar para a aba de noticias nao quebra', () => {
  abas[1].disparar('click');
  assert.match(porId.explicacao.textContent, /Cobertura recente/);
  assert.equal(porId.saida.className, 'lista-noticias');
});

ok('trocar para a aba de artigos nao quebra', () => {
  abas[2].disparar('click');
  assert.equal(porId.saida.className, 'lista-artigos');
});

ok('voltar para aplicacoes re-renderiza', () => {
  abas[0].disparar('click');
  assert.equal(fichas().length, aplicacoes.length);
});

console.log('\n' + passou + ' verificacoes passaram');
