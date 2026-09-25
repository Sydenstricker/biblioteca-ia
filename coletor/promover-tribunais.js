// Fase 2 do hub de tribunais: dobra data/tribunais/pendentes.json no acervo.
//
//   node coletor/promover-tribunais.js
//
// A fase 1 (main-tribunais.js) ja gravou os itens de confianca alta e o workflow
// ja publicou aquilo na main. Aqui entram os que ficaram de fora -- os que o
// proprio modelo marcou com confianca abaixo do limiar. O workflow roda este
// script DEPOIS do commit, de modo que o Pull Request resultante contenha
// exatamente estes itens e nada mais: merge aceita, apagar o bloco rejeita.
//
// Nao ha chamada de LLM aqui. Nada e reclassificado: so movido.

import { existsSync, rmSync } from 'node:fs';
import {
  C, chave, escrever, ler, ordenarArtigos, ordenarNoticias, podarNoticias,
} from './tribunais-acervo.js';

if (!existsSync(C.pendentes)) {
  console.log('nada pendente de revisao. Encerrando.');
  process.exit(0);
}

const pendentes = ler(C.pendentes, { noticias: [], artigos: [] });
const noticias = ler(C.noticias, []);
const artigos = ler(C.artigos, []);

// A fase 1 escreveu estes arquivos ha segundos, mas o dedup fica: se a mesma URL
// chegou por duas consultas, ela nao pode entrar duas vezes no JSON do site.
const conhecidos = new Set([...noticias, ...artigos].map((i) => chave(i.url)));
const novasNoticias = (pendentes.noticias || []).filter((n) => !conhecidos.has(chave(n.url)));
const novosArtigos = (pendentes.artigos || []).filter((a) => !conhecidos.has(chave(a.url)));

const { vivas, podadas } = podarNoticias([...noticias, ...novasNoticias]);
escrever(C.noticias, ordenarNoticias(vivas));
escrever(C.artigos, ordenarArtigos([...artigos, ...novosArtigos]));
rmSync(C.pendentes);

console.log(novasNoticias.length + ' noticias e ' + novosArtigos.length
  + ' artigos de confianca baixa adicionados para revisao'
  + (podadas ? ' (' + podadas + ' podadas por idade)' : '') + '.');
