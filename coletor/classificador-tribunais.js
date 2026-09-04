// Classificador do hub "IA em Tribunais".
//
// Duas diferencas em relacao ao classificador geral:
//
//   1. O modelo NAO decide a procedencia. Quem publicou e questao de autoria, nao
//      de conteudo, e o dominio da URL responde melhor: ver coletor/procedencia.js.
//      Aqui o modelo so responde sobre DISPUTA factual (campo `disputa`), que
//      nenhum dominio resolve -- um orgao oficial pode publicar algo depois negado.
//      Assim o modelo consegue rebaixar um item, nunca promove-lo a "oficial".
//
//   2. Campo `sistemas_mencionados`. Notícia sobre "TJBA amplia uso de IA" costuma
//      nomear o sistema. Extraindo esses nomes, a NOTICIA ALIMENTA O CATALOGO de
//      aplicacoes, que e o pilar sem API publica. Sao apenas candidatos: entram no
//      PR como sugestao, para voce confirmar com fonte primaria.

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const taxonomia = JSON.parse(readFileSync(join(RAIZ, 'taxonomia-tribunais.json'), 'utf8'));

export const MODELO = process.env.MODELO_CLASSIFICADOR || 'claude-opus-5';
const ITENS_POR_CHAMADA = 6; // menor que no geral: os textos aqui sao mais longos
const CHAMADAS_PARALELAS = 3;

const V = {
  tipo: taxonomia.tipo.valores.map((v) => v.id),
  verificacao: taxonomia.verificacao.valores.map((v) => v.id),
  paises: taxonomia.paises.valores,
  orgaos: taxonomia.orgaos.valores,
  fases: taxonomia.fases.valores,
  aplicacoes: taxonomia.aplicacoes.valores,
  temas: taxonomia.temas.valores,
};

function construirSchema() {
  const umItem = {
    type: 'object',
    properties: {
      indice: { type: 'integer', description: 'Indice do item na lista enviada.' },
      relevante: {
        type: 'boolean',
        description:
          'true somente se o item tratar especificamente de INTELIGENCIA ARTIFICIAL '
          + 'aplicada ao Judiciario, ao Ministerio Publico, a advocacia contenciosa ou a '
          + 'administracao da justica. Marque false para: IA em geral sem recorte '
          + 'juridico; direito sem IA; IA em medicina, financas ou outro setor; '
          + 'materia meramente promocional de fornecedor; e recorte eleitoral sobre '
          + 'deepfake em campanha, que e outro tema.',
      },
      motivo_descarte: { type: 'string', description: 'Se relevante=false, uma frase curta. Senao, string vazia.' },
      resumo: {
        type: 'string',
        description:
          'De 2 a 3 frases em portugues do Brasil dizendo o que houve e por que importa '
          + 'para quem trabalha no Judiciario. Sem adjetivo de propaganda. Se o texto '
          + 'recebido for so a manchete, diga o que ela afirma sem extrapolar.',
      },
      // NAO peca ao modelo para julgar autoria: quem publicou e decidido pelo
      // dominio, em coletor/procedencia.js. Aqui ele so responde se ha DISPUTA
      // factual, que e juizo de conteudo e nenhum dominio resolve.
      disputa: {
        type: 'string',
        enum: ['nenhuma', 'contestado', 'desmentido'],
        description:
          'nenhuma: nada indica disputa sobre os fatos relatados (o caso comum). '
          + 'contestado: o funcionamento, o alcance ou a legitimidade do que se '
          + 'afirma sao objeto de disputa publica documentada no proprio texto. '
          + 'desmentido: o texto registra que uma afirmacao antes divulgada foi '
          + 'negada pela fonte oficial. '
          + 'Na duvida responda "nenhuma" -- nao infira polemica a partir de tom critico.',
      },
      paises: { type: 'array', items: { type: 'string', enum: V.paises }, minItems: 1, maxItems: 3 },
      orgaos: { type: 'array', items: { type: 'string', enum: V.orgaos }, minItems: 1, maxItems: 3 },
      fases: { type: 'array', items: { type: 'string', enum: V.fases }, minItems: 1, maxItems: 3 },
      aplicacoes: { type: 'array', items: { type: 'string', enum: V.aplicacoes }, minItems: 1, maxItems: 3 },
      temas: { type: 'array', items: { type: 'string', enum: V.temas }, minItems: 1, maxItems: 4 },
      sistemas_mencionados: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string', description: 'Nome proprio do sistema, como VICTOR, Athos, ASSIS, Elis.' },
            orgao: { type: 'string', description: 'Orgao que o opera, se dito. Senao, string vazia.' },
          },
          required: ['nome', 'orgao'],
          additionalProperties: false,
        },
        maxItems: 4,
        description:
          'Sistemas de IA NOMEADOS no texto e operados por orgao de justica. Só nomes '
          + 'proprios de sistemas -- nunca produtos genericos de mercado (ChatGPT, Copilot) '
          + 'nem o nome do tribunal sozinho. Array vazio se nenhum for nomeado.',
      },
      confianca: { type: 'number', description: 'De 0 a 1. Seja honesto: abaixo de 0,5 vai para revisao manual.' },
    },
    required: [
      'indice', 'relevante', 'motivo_descarte', 'resumo', 'disputa', 'paises',
      'orgaos', 'fases', 'aplicacoes', 'temas', 'sistemas_mencionados', 'confianca',
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
  'Voce cataloga material sobre inteligencia artificial no Poder Judiciario para um hub',
  'de consulta em portugues do Brasil, dirigido a servidores e magistrados.',
  '',
  'O eixo e o Judiciario BRASILEIRO. Material internacional entra quando serve de',
  'comparacao, licao ou precedente relevante para o Brasil.',
  '',
  'REGRAS',
  '',
  '1. Seja severo em "relevante". As fontes sao agregadores ruidosos.',
  '',
  '2. NAO julgue quem publicou. A procedencia (fonte primaria ou secundaria) e',
  '   decidida pelo dominio da URL, fora daqui, de forma deterministica. Voce so',
  '   responde sobre DISPUTA factual, no campo "disputa", e o padrao e "nenhuma".',
  '   Este dominio e cheio de afirmacao repetida sem checagem -- o caso classico e',
  '   o "juiz-robo da Estonia", noticiado mundialmente e depois desmentido pelo',
  '   Ministerio da Justica estoniano. E esse tipo de registro que "desmentido"',
  '   deve capturar, nao mera critica ou ceticismo do autor.',
  '',
  '3. Nunca invente. Se a manchete nao diz qual sistema foi usado, nao suponha.',
  '   Baixe a confianca em vez de preencher com plausibilidade.',
  '',
  '4. Use SOMENTE os valores da taxonomia; sao impostos pelo schema.',
  '',
  'TAXONOMIA',
  JSON.stringify({
    paises: V.paises,
    orgaos: V.orgaos,
    fases: V.fases,
    aplicacoes: V.aplicacoes,
    temas: V.temas,
  }, null, 1),
].join('\n');

const FERRAMENTA = {
  name: 'registrar_classificacoes',
  description: 'Registra a classificacao de cada item recebido, na ordem em que apareceram.',
  strict: true,
  input_schema: construirSchema(),
};

async function classificarLote(cliente, lote, log) {
  const texto = lote
    .map((it, i) => [
      '--- item ' + i + ' (' + (it._tipoAlvo || 'desconhecido') + ') ---',
      'Titulo: ' + it.nome,
      'URL: ' + it.url,
      it.descricao,
    ].join('\n'))
    .join('\n\n');

  const resposta = await cliente.messages.create({
    model: MODELO,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    tools: [FERRAMENTA],
    messages: [{ role: 'user', content: 'Classifique os ' + lote.length + ' itens abaixo.\n\n' + texto }],
  });

  if (resposta.stop_reason === 'refusal') {
    log('  [llm] lote recusado (' + (resposta.stop_details?.category ?? '?') + ')');
    return [];
  }
  const chamada = resposta.content.find((b) => b.type === 'tool_use');
  if (!chamada) { log('  [llm] modelo nao chamou a ferramenta'); return []; }

  const u = resposta.usage;
  log('  [llm] lote de ' + lote.length + ': ' + u.input_tokens + ' in / ' + u.output_tokens
    + ' out / ' + (u.cache_read_input_tokens ?? 0) + ' cache');

  return (chamada.input.classificacoes || [])
    .filter((c) => lote[c.indice])
    .map((c) => ({ ...c, _bruto: lote[c.indice], _modelo: MODELO, _uso: u }));
}

export async function classificar(itens, { log = console.log } = {}) {
  const vazio = { aprovados: [], descartados: [], uso: { entrada: 0, saida: 0, cache: 0 } };
  if (itens.length === 0) return vazio;

  const cliente = new Anthropic();
  const lotes = [];
  for (let i = 0; i < itens.length; i += ITENS_POR_CHAMADA) lotes.push(itens.slice(i, i + ITENS_POR_CHAMADA));
  log('  [llm] ' + itens.length + ' itens em ' + lotes.length + ' chamadas (modelo: ' + MODELO + ')');

  const resultados = [];
  const vistos = new Set();
  const falhas = [];

  for (let i = 0; i < lotes.length; i += CHAMADAS_PARALELAS) {
    const respostas = await Promise.allSettled(
      lotes.slice(i, i + CHAMADAS_PARALELAS).map((l) => classificarLote(cliente, l, log)),
    );
    for (const r of respostas) {
      if (r.status !== 'fulfilled') {
        const msg = r.reason?.message ?? String(r.reason);
        falhas.push(msg);
        log('  [llm] chamada falhou: ' + msg);
        continue;
      }
      for (const c of r.value) {
        if (vistos.has(c._bruto.url)) continue;
        vistos.add(c._bruto.url);
        resultados.push(c);
      }
    }
  }

  // Falhar alto, nunca em silencio -- ver a mesma guarda em classificador.js.
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

  const uso = resultados.reduce((a, r) => ({
    entrada: a.entrada + (r._uso?.input_tokens ?? 0),
    saida: a.saida + (r._uso?.output_tokens ?? 0),
    cache: a.cache + (r._uso?.cache_read_input_tokens ?? 0),
  }), { entrada: 0, saida: 0, cache: 0 });

  return {
    aprovados: resultados.filter((r) => r.relevante),
    descartados: resultados.filter((r) => !r.relevante),
    uso,
  };
}
