// Orquestrador do coletor.
//
//   fontes -> dedup -> portao barato -> LLM -> data/pendentes.json -> promover.js
//
// Nada aqui promove item nenhum ao acervo. Este arquivo so deposita o resultado da
// classificacao em data/pendentes.json (fora do git); quem decide o que entra e
// promover.js, e ele separa por confianca: alta vai direto para a main, baixa vira
// Pull Request. E essa bifurcacao que impede a biblioteca de virar lixeira sem
// cobrar sua atencao todo mes. Veja o README, secao "Por que um portao seletivo".
//
// A excecao sao as mencoes e os sinais dos itens JA conhecidos, que este arquivo
// atualiza em data/itens.json: sao contadores de algo que voce ja aprovou um dia.
//
//   node main.js --seco    coleta e mostra o que seria classificado, sem gastar LLM
//   node main.js           roda o pipeline completo

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { chaveDedup, finalizarItem, validarItem, hoje } from './schema.js';
import * as github from './fontes/github.js';
import * as hackernews from './fontes/hackernews.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DADOS = join(RAIZ, 'data');

const CAMINHOS = {
  itens: join(DADOS, 'itens.json'),
  pendentes: join(DADOS, 'pendentes.json'),
  rejeitados: join(DADOS, 'rejeitados.json'),
  sinais: join(DADOS, 'sinais.jsonl'),
};

const FONTES = [github, hackernews];
const SECO = process.argv.includes('--seco');

const log = console.log;

function lerJson(caminho, padrao) {
  if (!existsSync(caminho)) return padrao;
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (e) {
    log('AVISO: ' + caminho + ' ilegivel (' + e.message + '), usando padrao');
    return padrao;
  }
}

function escreverJson(caminho, dados) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, JSON.stringify(dados, null, 2) + '\n', 'utf8');
}

/**
 * Portao barato, antes de gastar um unico token.
 * Ordem importa: o que descarta mais itens vem primeiro.
 */
function portao(brutos, conhecidos, rejeitados) {
  const PADROES_LIXO = [
    /^awesome[- ]/i, /\bcheat.?sheet\b/i, /\b(tutorial|curso|course|bootcamp)\b/i,
    /\b(roadmap|interview|leetcode)\b/i, /^(book|livro|ebook)\b/i,
    /\bprompts?[- ]?(collection|list|library)\b/i,
  ];

  const passaram = [];
  const barrados = { ja_no_acervo: 0, ja_rejeitado: 0, padrao_lixo: 0, sem_texto: 0 };

  for (const bruto of brutos) {
    const chave = chaveDedup(bruto.url);

    if (conhecidos.has(chave)) { barrados.ja_no_acervo++; continue; }
    if (rejeitados.has(chave)) { barrados.ja_rejeitado++; continue; }
    if (!bruto.descricao || bruto.descricao.length < 25) { barrados.sem_texto++; continue; }
    if (PADROES_LIXO.some((p) => p.test(bruto.nome))) { barrados.padrao_lixo++; continue; }

    passaram.push(bruto);
  }

  return { passaram, barrados };
}

/**
 * Itens que ja estao no acervo e reapareceram nas fontes: atualiza o sinal e
 * incrementa mencoes. E daqui que sai a nocao de tendencia -- um item visto 9
 * vezes em 3 meses esta em ascensao, um nao visto ha 6 meses esta esfriando.
 */
function atualizarConhecidos(acervo, brutos) {
  const porChave = new Map(brutos.map((b) => [chaveDedup(b.url), b]));
  let tocados = 0;
  const linhasSinais = [];

  for (const item of acervo) {
    const visto = porChave.get(item.id);
    if (!visto) continue;

    item.ultima_verificacao = hoje();
    item.mencoes = (item.mencoes || 0) + 1;
    item.sinais = { ...item.sinais, ...visto.sinais };
    tocados++;

    linhasSinais.push(JSON.stringify({ data: hoje(), id: item.id, sinais: visto.sinais }));
  }

  if (linhasSinais.length) {
    mkdirSync(DADOS, { recursive: true });
    appendFileSync(CAMINHOS.sinais, linhasSinais.join('\n') + '\n', 'utf8');
  }
  return tocados;
}

/** Estimativa de custo. Precos por milhao de tokens, Claude API, cache read = 0,1x entrada. */
function estimarCusto(uso, modelo) {
  const TABELA = {
    'claude-opus-5': [5, 25],
    'claude-sonnet-5': [2, 10],
    'claude-haiku-4-5': [1, 5],
  };
  const [entrada, saida] = TABELA[modelo] || TABELA['claude-opus-5'];
  return (uso.entrada * entrada + uso.saida * saida + uso.cache * entrada * 0.1) / 1e6;
}

async function principal() {
  log('=== coletor da biblioteca de IA -- ' + hoje() + (SECO ? ' (ENSAIO SECO)' : '') + ' ===\n');

  const acervo = lerJson(CAMINHOS.itens, []);
  const rejeitados = lerJson(CAMINHOS.rejeitados, []);
  const conhecidos = new Set(acervo.map((i) => i.id));
  const chavesRejeitadas = new Set(rejeitados.map((r) => r.id));
  log('acervo atual: ' + acervo.length + ' itens | rejeitados antes: ' + rejeitados.length + '\n');

  log('1. coletando das fontes');
  const brutos = [];
  for (const fonte of FONTES) {
    try {
      const achados = await fonte.coletar({ log });
      log('  ' + fonte.nome + ': ' + achados.length + ' brutos');
      brutos.push(...achados.map((b) => ({ ...b, _fonte: fonte.nome })));
    } catch (e) {
      log('  ' + fonte.nome + ' FALHOU: ' + e.message);
    }
  }
  log('  total bruto: ' + brutos.length + '\n');

  // Nenhuma fonte devolver nada nao e "mes calmo": e fonte quebrada.
  // Bloqueio por IP de datacenter, mudanca de API, feed fora do ar -- tudo isso
  // terminaria verde e sem alteracao se nao fosse esta guarda.
  if (brutos.length === 0) {
    throw new Error(
      'todas as fontes devolveram zero itens. Isso indica fonte quebrada, nao ausencia '
      + 'de novidades. Rode com --seco para ver os erros de cada fonte.',
    );
  }

  log('2. atualizando itens ja conhecidos');
  const tocados = atualizarConhecidos(acervo, brutos);
  log('  ' + tocados + ' itens do acervo reapareceram (mencoes +1)\n');

  log('3. portao de qualidade (sem custo de LLM)');
  const { passaram, barrados } = portao(brutos, conhecidos, chavesRejeitadas);
  for (const [motivo, n] of Object.entries(barrados)) {
    if (n) log('  barrados por ' + motivo + ': ' + n);
  }
  log('  candidatos para o LLM: ' + passaram.length + '\n');

  if (SECO) {
    log('ENSAIO SECO -- nao chamando o LLM. Candidatos:');
    for (const c of passaram.slice(0, 30)) log('  - ' + c.nome + '  (' + c.url + ')');
    if (passaram.length > 30) log('  ... e mais ' + (passaram.length - 30));
    return;
  }

  if (passaram.length === 0) {
    log('nada novo. Encerrando sem alteracoes.');
    escreverJson(CAMINHOS.itens, acervo); // ainda grava mencoes/sinais atualizados
    return;
  }

  log('4. classificando com o LLM');
  const { classificar, MODELO } = await import('./classificador.js');
  const { aprovados, descartados, uso } = await classificar(passaram, { log });
  log('  aprovados: ' + aprovados.length + ' | descartados pelo modelo: ' + descartados.length);
  log('  custo estimado desta rodada: US$ ' + estimarCusto(uso, MODELO).toFixed(4) + '\n');

  log('5. montando e validando');
  const pendentes = [];
  let invalidos = 0;
  for (const c of aprovados) {
    const item = finalizarItem(c._bruto, c, c._bruto._fonte);
    const erros = validarItem(item);
    if (erros.length) {
      log('  INVALIDO ' + item.nome + ': ' + erros.join('; '));
      invalidos++;
      continue;
    }
    if (item.confianca < 0.5) item.nota_curador = 'confianca baixa -- confira antes de aceitar';
    pendentes.push(item);
  }
  log('  validos: ' + pendentes.length + ' | rejeitados na validacao: ' + invalidos + '\n');

  // Descartes viram memoria permanente: nunca reprocessamos nem re-sugerimos o mesmo lixo.
  const novosRejeitados = descartados.map((d) => ({
    id: chaveDedup(d._bruto.url),
    nome: d._bruto.nome,
    motivo: d.motivo_descarte,
    data: hoje(),
  }));

  escreverJson(CAMINHOS.itens, acervo);
  escreverJson(CAMINHOS.pendentes, pendentes);
  escreverJson(CAMINHOS.rejeitados, [...rejeitados, ...novosRejeitados]);

  log('=== resumo ===');
  log(pendentes.length + ' itens novos em data/pendentes.json, aguardando revisao.');
  log(novosRejeitados.length + ' adicionados a lista de rejeitados.');
  log(tocados + ' itens existentes tiveram o sinal atualizado.');
}

principal().catch((e) => {
  console.error('coletor falhou:', e);
  process.exit(1);
});
