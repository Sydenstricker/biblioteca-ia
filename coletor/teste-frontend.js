// Teste de fumaca do frontend sem navegador.
//
// Monta um DOM minimo em memoria, importa assets/app.js de verdade e verifica que
// o acervo renderiza e que os filtros filtram. Pega o modo de falha mais comum e
// mais chato de diagnosticar: pagina em branco por erro de seletor ou nome de campo.
//
//   node coletor/teste-frontend.js

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

import { montarDom } from './dom-falso.js';

const porId = montarDom(['filtros', 'busca', 'ordem', 'grade', 'contagem', 'limpar', 'vazio', 'tema', 'rodape-info', 'link-repo']);

globalThis.fetch = async (caminho) => ({
  ok: true, // carimbo.js checa isto antes de ler o corpo
  json: async () => JSON.parse(readFileSync(join(RAIZ, caminho), 'utf8')),
});

// ---------- execucao ----------

await import(pathToFileURL(join(RAIZ, 'assets', 'app.js')).href);
await new Promise((r) => setTimeout(r, 60)); // deixa carregar() resolver

const acervo = JSON.parse(readFileSync(join(RAIZ, 'data', 'itens.json'), 'utf8'));
const ativos = acervo.filter((i) => i.status !== 'descontinuado');

function cartoes() { return porId.grade.buscarTodos('cartao'); }
function opcoes(campo) {
  return porId.filtros.buscarTodos('opcao').filter((e) => e.dataset.campo === campo);
}

let passou = 0;
function ok(nome, fn) {
  try { fn(); console.log('  ok  ' + nome); passou++; }
  catch (e) { console.log('  FALHOU  ' + nome + '\n      ' + e.message); process.exitCode = 1; }
}

console.log('teste de fumaca do frontend\n');

ok('renderiza um cartao por item do acervo', () => {
  assert.equal(cartoes().length, ativos.length);
});

ok('a contagem reflete o acervo', () => {
  assert.match(porId.contagem.textContent, new RegExp(String(ativos.length)));
});

ok('monta as seis dimensoes de filtro', () => {
  assert.equal(porId.filtros.filhos.length, 6);
});

ok('cada cartao tem nome, resumo e tags', () => {
  const c = cartoes()[0];
  assert.ok(c.buscarTodos('resumo').length === 1, 'sem resumo');
  assert.ok(c.buscarTodos('tag').length > 0, 'sem tags');
  assert.ok(c.buscarTodos('selo').length === 1, 'sem selo de implementacao');
});

ok('as contagens por faceta batem com o acervo', () => {
  const oss = opcoes('implementacao').find((o) => o.dataset.valor === 'Open Source');
  const esperado = ativos.filter((i) => i.implementacao === 'Open Source').length;
  assert.equal(oss.buscarTodos('n')[0]?.textContent || oss.filhos[2].textContent, String(esperado));
});

ok('filtrar por industria reduz o resultado', () => {
  const juridico = opcoes('industrias').find((o) => o.dataset.valor === 'Juridico');
  const caixa = juridico.filhos[0];
  caixa.checked = true;
  caixa.disparar('change');
  const esperado = ativos.filter((i) => i.industrias.includes('Juridico')).length;
  assert.equal(cartoes().length, esperado, 'esperava ' + esperado + ' itens juridicos');
  assert.ok(esperado > 0 && esperado < ativos.length, 'filtro precisa ser discriminante');
});

ok('o filtro ativo vai para a URL', () => {
  assert.match(globalThis._ultimaUrl || '', /i=Juridico/);
});

ok('limpar restaura o acervo inteiro', () => {
  porId.limpar.disparar('click');
  assert.equal(cartoes().length, ativos.length);
});

ok('busca textual sem acento encontra item com acento', () => {
  porId.busca.value = 'juridico';
  porId.busca.disparar('input', { target: { value: 'juridico' } });
  return new Promise((r) => setTimeout(r, 200)).then(() => {});
});

await new Promise((r) => setTimeout(r, 220));
ok('a busca por "juridico" retornou algo', () => {
  assert.ok(cartoes().length > 0, 'busca sem acento nao casou nenhum item acentuado');
  assert.ok(cartoes().length < ativos.length, 'busca nao filtrou nada');
});

ok('o carimbo da ultima rodada aparece no rodape', () => {
  const texto = porId['rodape-info'].textContent;
  assert.match(texto, /^Atualizado em [0-9]{1,2} de [a-zc]+ de [0-9]{4}$/,
    'rodape ficou "' + texto + '" -- carimbo.js nao escreveu, ou mudou de formato');
});

console.log('\n' + passou + ' verificacoes passaram');
