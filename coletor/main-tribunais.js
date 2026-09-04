// Orquestrador do hub "IA em Tribunais".
//
//   noticias + academico -> portao -> LLM -> data/tribunais/*.json -> PR
//
// Diferencas em relacao ao coletor geral:
//   - Duas colecoes de saida com ciclos de vida distintos (noticia decai, artigo nao).
//   - Os sistemas nomeados nas noticias viram candidatos a aplicacao, que e o pilar
//     sem API publica.
//   - Noticia antiga e podada: um jornal que guarda tudo para sempre vira arquivo morto.
//
//   node coletor/main-tribunais.js --seco
//   node coletor/main-tribunais.js

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { hoje } from './schema.js';
import { resolverVerificacao } from './procedencia.js';
import * as fonteNoticias from './fontes/noticias-tribunais.js';
import * as fonteAcademico from './fontes/academico.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'data', 'tribunais');

const C = {
  aplicacoes: join(DIR, 'aplicacoes.json'),
  noticias: join(DIR, 'noticias.json'),
  artigos: join(DIR, 'artigos.json'),
  candidatos: join(DIR, 'candidatos-aplicacoes.json'),
  rejeitados: join(DIR, 'rejeitados.json'),
};

const MESES_RETENCAO_NOTICIA = 18;
const SECO = process.argv.includes('--seco');
const log = console.log;

const ler = (p, padrao) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : padrao);

function escrever(p, dados) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(dados, null, 2) + '\n', 'utf8');
}

/** URL canonica para dedup: sem querystring de rastreio nem barra final. */
function chave(url) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')).toLowerCase();
  } catch { return url.toLowerCase(); }
}

function estimarCusto(uso, modelo) {
  const T = { 'claude-opus-5': [5, 25], 'claude-sonnet-5': [2, 10], 'claude-haiku-4-5': [1, 5] };
  const [e, s] = T[modelo] || T['claude-opus-5'];
  return (uso.entrada * e + uso.saida * s + uso.cache * e * 0.1) / 1e6;
}

async function principal() {
  log('=== hub IA em Tribunais -- ' + hoje() + (SECO ? ' (ENSAIO SECO)' : '') + ' ===\n');

  const noticias = ler(C.noticias, []);
  const artigos = ler(C.artigos, []);
  const aplicacoes = ler(C.aplicacoes, []);
  const candidatos = ler(C.candidatos, []);
  const rejeitados = ler(C.rejeitados, []);

  const conhecidos = new Set([
    ...noticias.map((n) => chave(n.url)),
    ...artigos.map((a) => chave(a.url)),
    ...rejeitados.map((r) => r.chave),
  ]);
  log('acervo: ' + aplicacoes.length + ' aplicacoes | ' + noticias.length + ' noticias | '
    + artigos.length + ' artigos | ' + rejeitados.length + ' rejeitados\n');

  log('1. coletando');
  const brutos = [];
  for (const fonte of [fonteNoticias, fonteAcademico]) {
    try {
      const achados = await fonte.coletar({ log });
      log('  ' + fonte.nome + ': ' + achados.length);
      brutos.push(...achados.map((b) => ({ ...b, _fonte: fonte.nome })));
    } catch (e) {
      log('  ' + fonte.nome + ' FALHOU: ' + e.message);
    }
  }

  log('\n2. portao (sem custo de LLM)');
  const novos = brutos.filter((b) => !conhecidos.has(chave(b.url)));
  log('  ' + brutos.length + ' brutos -> ' + novos.length + ' novos ('
    + (brutos.length - novos.length) + ' ja conhecidos)\n');

  if (SECO) {
    log('ENSAIO SECO -- nao chamando o LLM. Candidatos:');
    for (const c of novos.slice(0, 25)) log('  [' + c._tipoAlvo + '] ' + c.nome.slice(0, 88));
    if (novos.length > 25) log('  ... e mais ' + (novos.length - 25));
    return;
  }
  if (novos.length === 0) { log('nada novo. Encerrando.'); return; }

  log('3. classificando');
  const { classificar, MODELO } = await import('./classificador-tribunais.js');
  const { aprovados, descartados, uso } = await classificar(novos, { log });
  log('  aprovados: ' + aprovados.length + ' | descartados: ' + descartados.length);
  log('  custo estimado: US$ ' + estimarCusto(uso, MODELO).toFixed(4) + '\n');

  log('4. montando');
  const novasNoticias = [];
  const novosArtigos = [];
  const nomesConhecidos = new Set(
    [...aplicacoes.map((a) => a.nome), ...candidatos.map((c) => c.nome)].map((n) => n.toLowerCase()),
  );
  const novosCandidatos = [];

  const contagemProcedencia = {};

  for (const c of aprovados) {
    const b = c._bruto;

    // A procedencia sai do dominio de quem publicou, nao do palpite do modelo.
    // Para noticia isso e o <source url> do Google News; para artigo, o proprio
    // link (DOI, arXiv). O modelo so pode rebaixar, via campo `disputa`.
    const proc = resolverVerificacao(b._urlVeiculo || b.url, c.disputa, { tipo: b._tipoAlvo });
    contagemProcedencia[proc.verificacao] = (contagemProcedencia[proc.verificacao] || 0) + 1;

    const base = {
      id: chave(b.url),
      nome: b.nome,
      url: b.url,
      resumo: c.resumo,
      verificacao: proc.verificacao,
      verificacao_motivo: proc.motivo,
      paises: c.paises,
      orgaos: c.orgaos,
      fases: c.fases,
      aplicacoes: c.aplicacoes,
      temas: c.temas,
      confianca: c.confianca,
      classificado_por: c._modelo,
      coletado_em: hoje(),
      sinais: b.sinais || {},
    };

    if (b._tipoAlvo === 'artigo') novosArtigos.push({ ...base, tipo: 'artigo' });
    else novasNoticias.push({ ...base, tipo: 'noticia' });

    // A noticia alimenta o catalogo: sistemas nomeados viram candidatos a aplicacao.
    for (const s of c.sistemas_mencionados || []) {
      const n = (s.nome || '').trim();
      if (n.length < 2 || nomesConhecidos.has(n.toLowerCase())) continue;
      nomesConhecidos.add(n.toLowerCase());
      novosCandidatos.push({
        nome: n,
        orgao: s.orgao || 'nao informado',
        visto_em: b.url,
        titulo_da_noticia: b.nome,
        data: hoje(),
        situacao: 'a confirmar com fonte primaria',
      });
    }
  }

  // Poda: noticia velha sai do JSON que o site carrega.
  const corte = new Date(Date.now() - MESES_RETENCAO_NOTICIA * 30 * 864e5).toISOString().slice(0, 10);
  const todasNoticias = [...noticias, ...novasNoticias];
  const noticiasVivas = todasNoticias.filter((n) => (n.sinais?.data_publicacao || n.coletado_em) >= corte);
  const podadas = todasNoticias.length - noticiasVivas.length;

  noticiasVivas.sort((a, b) => (b.sinais?.data_publicacao || b.coletado_em)
    .localeCompare(a.sinais?.data_publicacao || a.coletado_em));
  const todosArtigos = [...artigos, ...novosArtigos]
    .sort((a, b) => (b.sinais?.citacoes ?? 0) - (a.sinais?.citacoes ?? 0));

  escrever(C.noticias, noticiasVivas);
  escrever(C.artigos, todosArtigos);
  escrever(C.candidatos, [...candidatos, ...novosCandidatos]);
  escrever(C.rejeitados, [
    ...rejeitados,
    ...descartados.map((d) => ({ chave: chave(d._bruto.url), nome: d._bruto.nome, motivo: d.motivo_descarte, data: hoje() })),
  ]);

  log('=== resumo ===');
  log(novasNoticias.length + ' noticias novas (' + podadas + ' podadas por idade)');
  log(novosArtigos.length + ' artigos novos');
  log('procedencia (decidida por dominio): '
    + Object.entries(contagemProcedencia).map(([k, v]) => k + '=' + v).join(' '));
  log(novosCandidatos.length + ' candidatos a aplicacao extraidos das noticias');
  if (novosCandidatos.length) {
    log('  -> confira cada um com fonte primaria antes de promover a data/tribunais/aplicacoes.json:');
    for (const c of novosCandidatos) log('     - ' + c.nome + ' (' + c.orgao + ')');
  }
}

principal().catch((e) => { console.error('coletor de tribunais falhou:', e); process.exit(1); });
