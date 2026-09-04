// Move data/pendentes.json para dentro de data/itens.json.
//
// Roda no workflow logo apos o coletor, de modo que o Pull Request mostre os itens
// novos como adicoes ao acervo -- e o diff do PR fica sendo, de graca, o resumo
// periodico de novidades. Revisar = ler o diff. Rejeitar um item = apagar o bloco
// dele no PR (ou fechar o PR inteiro).
//
//   node coletor/promover.js

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validarItem } from './schema.js';

const DADOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ITENS = join(DADOS, 'itens.json');
const PENDENTES = join(DADOS, 'pendentes.json');

if (!existsSync(PENDENTES)) {
  console.log('nada pendente. Encerrando.');
  process.exit(0);
}

const acervo = JSON.parse(readFileSync(ITENS, 'utf8'));
const pendentes = JSON.parse(readFileSync(PENDENTES, 'utf8'));
const conhecidos = new Set(acervo.map((i) => i.id));

const aceitos = [];
for (const item of pendentes) {
  if (conhecidos.has(item.id)) {
    console.log('  ja no acervo, pulando: ' + item.nome);
    continue;
  }
  const erros = validarItem(item);
  if (erros.length) {
    console.log('  INVALIDO, pulando ' + item.nome + ': ' + erros.join('; '));
    continue;
  }
  conhecidos.add(item.id);
  aceitos.push(item);
}

// Ordem alfabetica estavel: sem isso o diff do PR vira ruido a cada rodada.
const novo = [...acervo, ...aceitos].sort((a, b) => a.id.localeCompare(b.id));

writeFileSync(ITENS, JSON.stringify(novo, null, 2) + '\n', 'utf8');
rmSync(PENDENTES);

console.log(aceitos.length + ' itens promovidos. Acervo agora: ' + novo.length + '.');
