// Classifica itens brutos contra a taxonomia fechada usando Claude.
//
// Duas decisoes definem o custo e a qualidade:
//   1. LOTE de itens por chamada -- amortiza o system prompt e o schema da ferramenta.
//   2. strict tool use com enums gerados de taxonomia.json -- o modelo nao consegue
//      inventar "Healthcare" quando a taxonomia diz "Saude". Sem isso o acervo
//      degrada em poucas semanas e nenhum filtro facetado funciona.

import Anthropic from '@anthropic-ai/sdk';
import { VALORES, taxonomia } from './schema.js';

export const MODELO = process.env.MODELO_CLASSIFICADOR || 'claude-opus-5';
const ITENS_POR_CHAMADA = 8;
const CHAMADAS_PARALELAS = 3;

/** Schema JSON gerado da taxonomia -- fonte unica de verdade, sem duplicacao. */
function construirSchema() {
  const umItem = {
    type: 'object',
    properties: {
      indice: { type: 'integer', description: 'O indice do item na lista enviada.' },
      relevante: {
        type: 'boolean',
        description:
          'false se isto nao for uma aplicacao/ferramenta/projeto de IA catalogavel '
          + '(ex: lista "awesome", curso, tutorial, artigo de opiniao, repo generico de '
          + 'estudos, ou algo sem relacao com IA). Itens irrelevantes sao descartados.',
      },
      motivo_descarte: {
        type: 'string',
        description: 'Se relevante=false, uma frase curta explicando. Senao, string vazia.',
      },
      tipo: { type: 'string', enum: VALORES.tipo },
      resumo: {
        type: 'string',
        description:
          'Exatamente 3 frases curtas em portugues do Brasil, nesta ordem: '
          + '(1) o que faz, (2) para quem e, (3) como e cobrado ou licenciado. '
          + 'Se algo for desconhecido, diga "nao informado" -- nunca invente.',
      },
      // ATENCAO: nada de minItems/maxItems. O strict tool use nao aceita
      // "complex array constraints" e devolve 400 na hora -- foi o que derrubou a
      // primeira rodada de producao. O limite vive na descricao (o modelo respeita)
      // e e imposto no codigo por limitar(), abaixo. Ver teste-schema.js.
      industrias: {
        type: 'array',
        items: { type: 'string', enum: VALORES.industrias },
        description: 'De 1 a 3 valores, do mais para o menos relevante.',
      },
      funcoes: {
        type: 'array',
        items: { type: 'string', enum: VALORES.funcoes },
        description: 'De 1 a 3 valores, do mais para o menos relevante.',
      },
      modalidades: {
        type: 'array',
        items: { type: 'string', enum: VALORES.modalidades },
        description: 'De 1 a 3 valores, do mais para o menos relevante.',
      },
      implementacao: { type: 'string', enum: VALORES.implementacao },
      maturidade: { type: 'string', enum: VALORES.maturidade },
      confianca: {
        type: 'number',
        description:
          'De 0 a 1: o quanto voce confia nesta classificacao dado o pouco texto recebido. '
          + 'Seja honesto; itens abaixo de 0,5 vao marcados para revisao manual.',
      },
    },
    required: [
      'indice', 'relevante', 'motivo_descarte', 'tipo', 'resumo', 'industrias',
      'funcoes', 'modalidades', 'implementacao', 'maturidade', 'confianca',
    ],
    additionalProperties: false,
  };

  return {
    type: 'object',
    properties: { classificacoes: { type: 'array', items: umItem } },
    required: ['classificacoes'],
    additionalProperties: false,
  };
}

const SISTEMA = [
  'Voce cataloga aplicacoes de inteligencia artificial para uma biblioteca de consulta em portugues do Brasil.',
  '',
  'Recebe itens crus de fontes automatizadas (GitHub, Hacker News). Para cada um, decide se',
  'merece entrar no acervo e o classifica na taxonomia fechada abaixo.',
  '',
  'REGRAS',
  '',
  '1. Seja severo no campo "relevante". A fonte e ruidosa. Marque relevante=false para:',
  '   listas "awesome-*", cursos e tutoriais, colecoes de prompts, artigos de opiniao,',
  '   repositorios de estudo pessoal, wrappers triviais de uma unica API, e qualquer coisa',
  '   que nao seja uma aplicacao, ferramenta ou projeto de IA de fato.',
  '   Um acervo pequeno e confiavel vale mais que um grande e poluido.',
  '',
  '2. Use SOMENTE os valores da taxonomia. Eles sao impostos pelo schema.',
  '   "Transversal" e a resposta certa em industrias quando a solucao nao pertence a setor',
  '   nenhum -- nao force um setor especifico so para preencher o campo.',
  '',
  '3. Nunca invente fatos. Se o texto recebido nao diz o modelo de cobranca, escreva',
  '   "cobranca nao informada". Baixe a confianca em vez de adivinhar.',
  '',
  '4. No maximo 3 valores por dimensao multipla, ordenados do mais para o menos relevante.',
  '   Tres tags certas valem mais que oito vagas.',
  '',
  'TAXONOMIA',
  JSON.stringify({
    tipo: taxonomia.tipo.valores,
    industrias: VALORES.industrias,
    funcoes: VALORES.funcoes,
    modalidades: VALORES.modalidades,
    implementacao: VALORES.implementacao,
    maturidade: VALORES.maturidade,
  }, null, 1),
].join('\n');

const FERRAMENTA = {
  name: 'registrar_classificacoes',
  description: 'Registra a classificacao de cada item recebido, na ordem em que apareceram.',
  strict: true,
  input_schema: construirSchema(),
};

/**
 * Impoe no codigo os limites que o schema nao pode impor.
 *
 * Como `maxItems` e rejeitado pelo strict tool use, o teto de valores por dimensao
 * so existe na descricao -- que o modelo segue quase sempre, mas nao por garantia.
 * Aparar aqui e o que mantem os cartoes legiveis e os filtros discriminantes.
 */
function limitar(c) {
  return {
    ...c,
    industrias: (c.industrias || []).slice(0, 3),
    funcoes: (c.funcoes || []).slice(0, 3),
    modalidades: (c.modalidades || []).slice(0, 3),
  };
}

async function classificarLote(cliente, lote, log) {
  const texto = lote
    .map((it, i) => [
      '--- item ' + i + ' ---',
      'Nome: ' + it.nome,
      'URL: ' + it.url,
      'Descricao: ' + it.descricao,
    ].join('\n'))
    .join('\n\n');

  const resposta = await cliente.messages.create({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' }, // classificar nao pede raciocinio profundo
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    tools: [FERRAMENTA],
    messages: [
      { role: 'user', content: 'Classifique os ' + lote.length + ' itens abaixo.\n\n' + texto },
    ],
  });

  if (resposta.stop_reason === 'refusal') {
    log('  [llm] lote recusado (' + (resposta.stop_details?.category ?? '?') + ') -- pulando');
    return [];
  }

  const chamada = resposta.content.find((b) => b.type === 'tool_use');
  if (!chamada) {
    log('  [llm] modelo nao chamou a ferramenta -- pulando lote');
    return [];
  }


  // Itens enviados que voltam sem classificacao sao repagos na proxima rodada.
  // A causa mais comum e truncamento por max_tokens: o array vem incompleto e
  // nada no retorno denuncia isso -- so o silencio.
  const devolvidas = (chamada.input.classificacoes || []).length;
  if (devolvidas < lote.length) {
    log('  [llm] AVISO: enviados ' + lote.length + ', devolvidos ' + devolvidas
      + (resposta.stop_reason === 'max_tokens' ? ' -- truncado por max_tokens' : '')
      + '. Os faltantes reaparecem na proxima rodada e serao repagos.');
  }
  const uso = resposta.usage;
  log('  [llm] lote de ' + lote.length + ': ' + uso.input_tokens + ' in / '
    + uso.output_tokens + ' out / ' + (uso.cache_read_input_tokens ?? 0) + ' cache');

  return (chamada.input.classificacoes || [])
    .filter((c) => lote[c.indice])
    .map((c) => ({ ...limitar(c), _bruto: lote[c.indice], _modelo: MODELO, _uso: uso }));
}

/** Classifica todos os itens. Devolve { aprovados, descartados, uso }. */
export async function classificar(itens, { log = console.log } = {}) {
  if (itens.length === 0) return { aprovados: [], descartados: [], uso: { entrada: 0, saida: 0, cache: 0 } };

  const cliente = new Anthropic();
  const lotes = [];
  for (let i = 0; i < itens.length; i += ITENS_POR_CHAMADA) {
    lotes.push(itens.slice(i, i + ITENS_POR_CHAMADA));
  }
  log('  [llm] ' + itens.length + ' itens em ' + lotes.length + ' chamadas (modelo: ' + MODELO + ')');

  const resultados = [];
  const vistos = new Set(); // o modelo pode repetir um indice entre lotes paralelos
  const falhas = [];

  for (let i = 0; i < lotes.length; i += CHAMADAS_PARALELAS) {
    const fatia = lotes.slice(i, i + CHAMADAS_PARALELAS);
    const respostas = await Promise.allSettled(
      fatia.map((lote) => classificarLote(cliente, lote, log)),
    );
    for (const r of respostas) {
      if (r.status === 'fulfilled') {
        for (const c of r.value) {
          if (vistos.has(c._bruto.url)) continue;
          vistos.add(c._bruto.url);
          resultados.push(c);
        }
      } else {
        const msg = r.reason?.message ?? String(r.reason);
        falhas.push(msg);
        log('  [llm] chamada falhou: ' + msg);
      }
    }
  }

  // Falhar alto, nunca em silencio.
  //
  // Antes desta guarda, um erro em TODAS as chamadas (chave invalida, saldo
  // zerado, modelo indisponivel) era apenas registrado no log: a funcao devolvia
  // lista vazia, o coletor gravava arquivos sem alteracao, o create-pull-request
  // nao via diff e o workflow terminava VERDE sem ter feito nada. Custou uma
  // sessao de depuracao para descobrir que o problema nao era o PR.
  if (falhas.length && resultados.length === 0) {
    throw new Error(
      'todas as ' + falhas.length + ' chamadas ao modelo falharam; nada foi classificado.\n'
      + 'Primeiro erro: ' + falhas[0] + '\n'
      + 'Verifique ANTHROPIC_API_KEY, o saldo de creditos da conta e o nome do modelo ('
      + MODELO + ').',
    );
  }
  if (falhas.length > lotes.length / 2) {
    throw new Error(
      'mais da metade das chamadas falhou (' + falhas.length + ' de ' + lotes.length
      + '); rodada abortada para nao gravar um resultado parcial silencioso.\n'
      + 'Primeiro erro: ' + falhas[0],
    );
  }

  const uso = resultados.reduce((acc, r) => ({
    entrada: acc.entrada + (r._uso?.input_tokens ?? 0),
    saida: acc.saida + (r._uso?.output_tokens ?? 0),
    cache: acc.cache + (r._uso?.cache_read_input_tokens ?? 0),
  }), { entrada: 0, saida: 0, cache: 0 });

  return {
    aprovados: resultados.filter((r) => r.relevante),
    descartados: resultados.filter((r) => !r.relevante),
    uso,
  };
}

/** Exposta so para coletor/teste-schema.js auditar o schema sem chamar a API. */
export const FERRAMENTA_PARA_TESTE = FERRAMENTA;
