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

import { hoje } from './schema.js';
import { resolverVerificacao } from './procedencia.js';
import {
  C, LIMIAR_CONFIANCA, chave, confiavel, escrever, ler,
  ordenarArtigos, ordenarNoticias, podarNoticias,
} from './tribunais-acervo.js';
import * as fonteNoticias from './fontes/noticias-tribunais.js';
import * as fonteAcademico from './fontes/academico.js';

const SECO = process.argv.includes('--seco');
const log = console.log;

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

  // Rebusca as citacoes dos artigos ja no acervo. Sem isto o numero congela no dia
  // da coleta -- o dedup impede que o artigo volte pelo caminho normal -- e as
  // ordenacoes "em ascensao" e "por velocidade" ficariam eternamente desatualizadas.
  if (artigos.length && !SECO) {
    log('');
    await fonteAcademico.atualizarSinais(artigos, { log });
  }

  log('\n2. portao (sem custo de LLM)');

  // Nenhuma fonte devolver nada nao e "mes calmo": e fonte quebrada.
  // Bloqueio por IP de datacenter, mudanca de API, feed fora do ar -- tudo isso
  // terminaria verde e sem alteracao se nao fosse esta guarda.
  if (brutos.length === 0) {
    throw new Error(
      'todas as fontes devolveram zero itens. Isso indica fonte quebrada, nao ausencia '
      + 'de novidades. Rode com --seco para ver os erros de cada fonte.',
    );
  }
  const novos = brutos.filter((b) => !conhecidos.has(chave(b.url)));
  log('  ' + brutos.length + ' brutos -> ' + novos.length + ' novos ('
    + (brutos.length - novos.length) + ' ja conhecidos)\n');

  if (SECO) {
    log('ENSAIO SECO -- nao chamando o LLM. Candidatos:');
    for (const c of novos.slice(0, 25)) log('  [' + c._tipoAlvo + '] ' + c.nome.slice(0, 88));
    if (novos.length > 25) log('  ... e mais ' + (novos.length - 25));
    return;
  }
  // Nada novo nao significa nada a gravar: as citacoes recem-atualizadas precisam
  // ser persistidas, senao a rodada inteira se perde.
  if (novos.length === 0) {
    log('nada novo a classificar.');
    escrever(C.artigos, artigos);
    log('citacoes dos ' + artigos.length + ' artigos atualizadas. Encerrando.');
    return;
  }

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

  // Fase 1: so o que o modelo classificou com confianca alta e gravado no acervo,
  // e o workflow publica isso direto na main. O restante vai para pendentes.json
  // (fora do git) e entra na fase 2, em promover-tribunais.js, virando um Pull
  // Request que contem SO os itens duvidosos -- o unico momento que pede um humano.
  const noticiasAuto = novasNoticias.filter(confiavel);
  const artigosAuto = novosArtigos.filter(confiavel);
  const paraRevisar = {
    noticias: novasNoticias.filter((n) => !confiavel(n)),
    artigos: novosArtigos.filter((a) => !confiavel(a)),
  };
  const nRevisar = paraRevisar.noticias.length + paraRevisar.artigos.length;

  const { vivas, podadas } = podarNoticias([...noticias, ...noticiasAuto]);
  escrever(C.noticias, ordenarNoticias(vivas));
  escrever(C.artigos, ordenarArtigos([...artigos, ...artigosAuto]));

  // Candidatos entram inteiros, inclusive os vindos de noticia em revisao: este
  // arquivo nao e catalogo, e fila de confirmacao -- nenhum deles vira ficha em
  // aplicacoes.json sem fonte primaria, em cenario nenhum.
  escrever(C.candidatos, [...candidatos, ...novosCandidatos]);
  escrever(C.rejeitados, [
    ...rejeitados,
    ...descartados.map((d) => ({ chave: chave(d._bruto.url), nome: d._bruto.nome, motivo: d.motivo_descarte, data: hoje() })),
  ]);
  if (nRevisar) escrever(C.pendentes, paraRevisar);

  log('=== resumo ===');
  log(noticiasAuto.length + ' noticias e ' + artigosAuto.length + ' artigos entraram direto '
    + '(confianca >= ' + LIMIAR_CONFIANCA + '); ' + podadas + ' noticias podadas por idade');
  if (nRevisar) log(nRevisar + ' itens de confianca baixa aguardando revisao humana');
  log('procedencia (decidida por dominio): '
    + Object.entries(contagemProcedencia).map(([k, v]) => k + '=' + v).join(' '));
  log(novosCandidatos.length + ' candidatos a aplicacao extraidos das noticias');
  if (novosCandidatos.length) {
    log('  -> confira cada um com fonte primaria antes de promover a data/tribunais/aplicacoes.json:');
    for (const c of novosCandidatos) log('     - ' + c.nome + ' (' + c.orgao + ')');
  }
}

principal().catch((e) => { console.error('coletor de tribunais falhou:', e); process.exit(1); });
