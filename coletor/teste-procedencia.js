// Testes da regra de procedencia.
//
// Esta regra substitui um julgamento do LLM por uma decisao deterministica.
// O valor dela esta em nunca promover indevidamente a "fonte primaria" -- por
// isso os casos negativos (materia sobre tribunal, escrita por terceiro) sao
// mais importantes que os positivos.
//
//   node coletor/teste-procedencia.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { classificarProcedencia, resolverVerificacao, hostDe } from './procedencia.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let passou = 0;
function ok(nome, fn) {
  try { fn(); console.log('  ok  ' + nome); passou++; }
  catch (e) { console.log('  FALHOU  ' + nome + '\n      ' + e.message); process.exitCode = 1; }
}

const eh = (url, esperado, tipo = 'noticia') =>
  assert.equal(classificarProcedencia(url, { tipo }).verificacao, esperado, url);

console.log('testes da regra de procedencia\n');

ok('dominios do Judiciario brasileiro sao primaria', () => {
  for (const u of [
    'https://noticias.stf.jus.br/postos/verNoticia.asp?id=1',
    'https://www.tjrj.jus.br/magistrado/servicos/assis/o-projeto',
    'https://atos.cnj.jus.br/atos/detalhar/6001',
    'https://www.stj.jus.br/sites/portalp/noticia',
    'https://web.trf3.jus.br/noticias/x',
    'https://www.tjsp.jus.br/Noticias/y',
  ]) eh(u, 'fonte_primaria');
});

ok('outros poderes e governos tambem sao primaria', () => {
  eh('https://www.gov.br/mj/pt-br/noticia', 'fonte_primaria');
  eh('https://www.mpf.mp.br/noticia', 'fonte_primaria');
  eh('https://www.uscourts.gov/news/x', 'fonte_primaria');
  eh('https://www.coe.int/en/web/cepej/x', 'fonte_primaria');
  eh('https://english.court.gov.cn/2022-12/12/c_838810.htm', 'fonte_primaria');
  eh('https://www.justdigi.ee/en/news/estonia-does-not-develop-ai-judge', 'fonte_primaria');
});

// O caso que motivou a regra inteira.
ok('imprensa noticiando um tribunal NAO vira primaria', () => {
  for (const u of [
    'https://tudorondonia.com/noticia/tjro-debate-uso-etico-da-ia',
    'https://www.conjur.com.br/2025-abr-17/tj-do-rio-amplia-uso-de-ia/',
    'https://www.migalhas.com.br/quentes/123/provimento-255-cnj',
    'https://g1.globo.com/tecnologia/noticia/stf-ia',
    'https://www.reuters.com/legal/mississippi-ai-ruling',
    'https://www.poder360.com.br/stf-debate-ia',
  ]) eh(u, 'fonte_secundaria');
});

ok('dominio parecido nao engana (jus.br dentro do caminho)', () => {
  eh('https://blogfalso.com/www.tjrj.jus.br/materia', 'fonte_secundaria');
  eh('https://tjrj.jus.br.exemplo.com/x', 'fonte_secundaria');
});

ok('URL ilegivel cai no grau menor', () => {
  eh('nao-e-url', 'fonte_secundaria');
  eh('', 'fonte_secundaria');
});

ok('DOI e arXiv sao a propria obra, mas so para artigo', () => {
  eh('https://doi.org/10.1016/j.artint.2020.103387', 'fonte_primaria', 'artigo');
  eh('https://arxiv.org/abs/2301.00001', 'fonte_primaria', 'artigo');
  // Como noticia, um link de DOI nao e comunicado institucional.
  eh('https://doi.org/10.1016/j.artint.2020.103387', 'fonte_secundaria', 'noticia');
});

ok('o LLM pode rebaixar, jamais promover', () => {
  // Tentativa de promover uma materia de jornal: ignorada.
  assert.equal(
    resolverVerificacao('https://g1.globo.com/x', 'fonte_primaria', { tipo: 'noticia' }).verificacao,
    'fonte_secundaria',
  );
  // Rebaixamento vale mesmo sobre dominio oficial.
  assert.equal(
    resolverVerificacao('https://www.justdigi.ee/en/news/x', 'desmentido', { tipo: 'noticia' }).verificacao,
    'desmentido',
  );
  assert.equal(
    resolverVerificacao('https://www.tjrj.jus.br/x', 'contestado', { tipo: 'noticia' }).verificacao,
    'contestado',
  );
});

ok('o motivo registrado nomeia o dominio que decidiu', () => {
  const r = classificarProcedencia('https://www.tjsc.jus.br/noticia');
  assert.match(r.motivo, /tjsc\.jus\.br/);
  assert.equal(hostDe('https://www.tjsc.jus.br/noticia'), 'tjsc.jus.br');
});

// Prova de nao-regressao contra a curadoria manual: a regra tem de reproduzir
// a classificacao que foi feita a mao nas aplicacoes semeadas.
ok('reproduz a curadoria manual das aplicacoes semeadas', () => {
  const apps = JSON.parse(readFileSync(join(RAIZ, 'data/tribunais/aplicacoes.json'), 'utf8'));
  let comparadas = 0;
  for (const a of apps) {
    if (a.verificacao !== 'fonte_primaria' && a.verificacao !== 'fonte_secundaria') continue;
    const r = classificarProcedencia(a.fontes[0].url, { tipo: a.tipo });
    assert.equal(r.verificacao, a.verificacao,
      a.nome + ': manual=' + a.verificacao + ' regra=' + r.verificacao + ' (' + r.host + ')');
    comparadas++;
  }
  assert.ok(comparadas >= 10, 'esperava comparar ao menos 10 aplicacoes, comparou ' + comparadas);
});

console.log('\n' + passou + ' verificacoes passaram');
