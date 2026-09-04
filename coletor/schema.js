// Forma canonica de um item do acervo, validacao e chave de deduplicacao.
// Este arquivo e o contrato entre as fontes, o classificador e o frontend.
// Mudou aqui? Migre data/itens.json no mesmo commit.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
export const taxonomia = JSON.parse(readFileSync(join(raiz, 'taxonomia.json'), 'utf8'));

export const VALORES = {
  tipo: taxonomia.tipo.valores.map((v) => v.id),
  industrias: taxonomia.industrias.valores,
  funcoes: taxonomia.funcoes.valores,
  modalidades: taxonomia.modalidades.valores,
  implementacao: taxonomia.implementacao.valores,
  maturidade: taxonomia.maturidade.valores,
  status: taxonomia.status.valores,
};

/**
 * Item do acervo. Campos agrupados por proposito:
 *
 *   identidade   id, tipo, nome, resumo, url, dominio
 *   classificacao industrias[], funcoes[], modalidades[], implementacao, maturidade
 *   proveniencia  fonte, fonte_url, classificado_por, confianca
 *   temporal      primeira_aparicao, ultima_verificacao, mencoes, sinais
 *   curadoria     status, nota_curador
 */

/** Remove acentos, baixa a caixa e troca nao-alfanumerico por hifen. */
export function slugificar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Chave de deduplicacao. Duas entradas com a mesma chave sao o mesmo item,
 * ainda que venham de fontes diferentes com nomes diferentes.
 *
 * Para o GitHub usamos owner/repo (o dominio seria sempre github.com);
 * para o resto, o host sem www mais o primeiro segmento do caminho -- assim
 * "acme.com/pricing" e "acme.com/docs" colapsam no mesmo produto, mas
 * "producthunt.com/posts/x" e "/posts/y" continuam distintos.
 */
export function chaveDedup(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return slugificar(url);
  }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const segmentos = u.pathname.split('/').filter(Boolean);

  if (host === 'github.com') return `github.com/${segmentos.slice(0, 2).join('/')}`.toLowerCase();

  const agregadores = ['producthunt.com', 'news.ycombinator.com', 'arxiv.org', 'huggingface.co'];
  if (agregadores.includes(host)) return `${host}/${segmentos.slice(0, 2).join('/')}`.toLowerCase();

  return host;
}

export function dominioDe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export function hoje() {
  return new Date().toISOString().slice(0, 10);
}

const OBRIGATORIOS = ['id', 'tipo', 'nome', 'resumo', 'url', 'implementacao', 'maturidade'];

/** Devolve uma lista de erros legiveis. Vazia = item valido. */
export function validarItem(item) {
  const erros = [];

  for (const campo of OBRIGATORIOS) {
    if (!item[campo]) erros.push(`campo obrigatorio ausente: ${campo}`);
  }

  const enumSimples = { tipo: 'tipo', implementacao: 'implementacao', maturidade: 'maturidade', status: 'status' };
  for (const [campo, dim] of Object.entries(enumSimples)) {
    if (item[campo] && !VALORES[dim].includes(item[campo])) {
      erros.push(`${campo}="${item[campo]}" fora da taxonomia`);
    }
  }

  for (const dim of ['industrias', 'funcoes', 'modalidades']) {
    const v = item[dim];
    if (!Array.isArray(v) || v.length === 0) {
      erros.push(`${dim} deve ser um array nao-vazio`);
      continue;
    }
    for (const valor of v) {
      if (!VALORES[dim].includes(valor)) erros.push(`${dim} contem "${valor}", fora da taxonomia`);
    }
  }

  if (item.resumo && item.resumo.length > 400) erros.push('resumo acima de 400 caracteres');
  if (item.url && !/^https?:\/\//.test(item.url)) erros.push('url deve comecar com http(s)://');

  return erros;
}

/** Preenche os campos gerenciados pelo coletor sobre um item ja classificado. */
export function finalizarItem(bruto, classificacao, fonte) {
  const url = bruto.url;
  return {
    id: chaveDedup(url),
    tipo: classificacao.tipo,
    nome: bruto.nome,
    resumo: classificacao.resumo,
    url,
    dominio: dominioDe(url),

    industrias: classificacao.industrias,
    funcoes: classificacao.funcoes,
    modalidades: classificacao.modalidades,
    implementacao: classificacao.implementacao,
    maturidade: classificacao.maturidade,

    fonte,
    fonte_url: bruto.fonte_url || url,
    classificado_por: classificacao._modelo,
    confianca: classificacao.confianca,

    primeira_aparicao: hoje(),
    ultima_verificacao: hoje(),
    mencoes: 1,
    sinais: bruto.sinais || {},

    status: 'ativo',
    nota_curador: '',
  };
}
