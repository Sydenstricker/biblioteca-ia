// Move data/pendentes.json para dentro de data/itens.json.
//
// Roda em DUAS FASES, e e essa divisao que deixa o coletor publicar sozinho sem o
// acervo virar lixeira:
//
//   node coletor/promover.js          so os itens que o modelo classificou com
//                                     confianca >= LIMIAR. O workflow publica estes
//                                     direto na main, sem esperar ninguem.
//
//   node coletor/promover.js --tudo   o restante, seja qual for a confianca. Estes
//                                     viram um Pull Request contendo SO eles, que e
//                                     o unico momento em que voce precisa olhar.
//
// O corte e o mesmo 0,5 que main.js usa para escrever `nota_curador`: quando o
// proprio modelo diz que classificou no escuro, um humano confere antes de entrar.
// Item sem campo `confianca` tambem cai para revisao -- ausencia nao e aprovacao.
//
// Entre as duas fases o workflow da commit na main. Por isso a fase 2 produz um
// diff pequeno e legivel: o PR mostra exatamente os itens duvidosos, nada mais.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validarItem } from './schema.js';

const DADOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ITENS = join(DADOS, 'itens.json');
const PENDENTES = join(DADOS, 'pendentes.json');

const LIMIAR_CONFIANCA = 0.5;
const TUDO = process.argv.includes('--tudo');

if (!existsSync(PENDENTES)) {
  console.log('nada pendente. Encerrando.');
  process.exit(0);
}

const acervo = JSON.parse(readFileSync(ITENS, 'utf8'));
const pendentes = JSON.parse(readFileSync(PENDENTES, 'utf8'));
const conhecidos = new Set(acervo.map((i) => i.id));

const aceitos = [];
const adiados = [];

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
  // Negado assim de proposito: confianca ausente, nula ou NaN cai para revisao.
  if (!TUDO && !(item.confianca >= LIMIAR_CONFIANCA)) {
    adiados.push(item);
    continue;
  }
  conhecidos.add(item.id);
  aceitos.push(item);
}

// Ordem alfabetica estavel: sem isso o diff do PR vira ruido a cada rodada.
const novo = [...acervo, ...aceitos].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(ITENS, JSON.stringify(novo, null, 2) + '\n', 'utf8');

if (adiados.length) {
  writeFileSync(PENDENTES, JSON.stringify(adiados, null, 2) + '\n', 'utf8');
} else {
  rmSync(PENDENTES);
}

console.log(aceitos.length + ' itens promovidos' + (TUDO ? '' : ' (confianca >= ' + LIMIAR_CONFIANCA + ')')
  + '. Acervo agora: ' + novo.length + '.');
if (adiados.length) {
  console.log(adiados.length + ' itens de confianca baixa aguardando revisao humana:');
  for (const a of adiados) console.log('  - ' + a.nome + ' (confianca ' + a.confianca + ')');
}
