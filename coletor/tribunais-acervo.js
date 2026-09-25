// Formato e ordenacao do acervo do hub de tribunais.
//
// Existe para ser compartilhado entre quem escreve na primeira fase
// (main-tribunais.js, itens de confianca alta) e quem escreve na segunda
// (promover-tribunais.js, itens que foram para revisao). As duas fases PRECISAM
// ordenar e podar identicamente: se divergirem, o segundo passo reescreve o
// arquivo inteiro numa ordem diferente e o diff do PR deixa de ser legivel --
// que e justamente o que torna a revisao rapida.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(RAIZ, 'data', 'tribunais');

export const C = {
  aplicacoes: join(DIR, 'aplicacoes.json'),
  noticias: join(DIR, 'noticias.json'),
  artigos: join(DIR, 'artigos.json'),
  candidatos: join(DIR, 'candidatos-aplicacoes.json'),
  rejeitados: join(DIR, 'rejeitados.json'),
  pendentes: join(DIR, 'pendentes.json'), // fora do git: estagio entre as duas fases
};

export const MESES_RETENCAO_NOTICIA = 18;

/** Mesmo corte de main.js: abaixo disso, um humano confere antes de entrar. */
export const LIMIAR_CONFIANCA = 0.5;

export const ler = (p, padrao) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : padrao);

export function escrever(p, dados) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(dados, null, 2) + '\n', 'utf8');
}

/** URL canonica para dedup: sem querystring de rastreio nem barra final. */
export function chave(url) {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')).toLowerCase();
  } catch { return url.toLowerCase(); }
}

/** Confianca ausente, nula ou NaN conta como baixa -- ausencia nao e aprovacao. */
export const confiavel = (item) => item.confianca >= LIMIAR_CONFIANCA;

const dataNoticia = (n) => n.sinais?.data_publicacao || n.coletado_em;

export const ordenarNoticias = (lista) =>
  [...lista].sort((a, b) => dataNoticia(b).localeCompare(dataNoticia(a)));

export const ordenarArtigos = (lista) =>
  [...lista].sort((a, b) => (b.sinais?.citacoes ?? 0) - (a.sinais?.citacoes ?? 0));

/** Noticia velha sai do JSON que o site carrega: jornal que guarda tudo vira arquivo morto. */
export function podarNoticias(lista) {
  const corte = new Date(Date.now() - MESES_RETENCAO_NOTICIA * 30 * 864e5).toISOString().slice(0, 10);
  const vivas = lista.filter((n) => dataNoticia(n) >= corte);
  return { vivas, podadas: lista.length - vivas.length };
}
