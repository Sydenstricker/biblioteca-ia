// Valida os schemas dos classificadores contra as limitacoes do strict tool use,
// SEM gastar um token.
//
// POR QUE ISTO EXISTE
//
// A primeira rodada de producao dos dois coletores morreu com 400 em todas as
// chamadas: "tools.0.custom: For 'array' type, property 'maxItems' is not
// supported". Eu havia suposto que restricoes comuns de JSON Schema passariam.
// Nao passam -- e a API so reporta UM erro por vez, entao descobrir na tentativa
// e caro e lento.
//
// A lista abaixo e a da documentacao oficial ("JSON Schema Limitations"),
// transcrita como teste. Se alguem reintroduzir qualquer uma delas, quebra aqui,
// em milissegundos, em vez de quebrar em producao.
//
//   node coletor/teste-schema.js

import assert from 'node:assert/strict';

// Palavras-chave que o strict tool use REJEITA com 400.
const PROIBIDAS = [
  'minItems', 'maxItems', 'uniqueItems', 'contains',   // complex array constraints
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern',
  'minProperties', 'maxProperties', 'patternProperties',
  'oneOf', 'not', 'if', 'then', 'else',
];

/** Percorre o schema inteiro acumulando problemas, com o caminho de cada um. */
function auditar(no, caminho = '$', problemas = []) {
  if (!no || typeof no !== 'object') return problemas;

  if (Array.isArray(no)) {
    no.forEach((v, i) => auditar(v, caminho + '[' + i + ']', problemas));
    return problemas;
  }

  for (const chave of Object.keys(no)) {
    if (PROIBIDAS.includes(chave)) {
      problemas.push(caminho + '.' + chave + ' -- nao suportado pelo strict tool use');
    }
  }

  // Todo objeto precisa fechar additionalProperties, e so com false.
  if (no.type === 'object') {
    if (no.additionalProperties !== false) {
      problemas.push(caminho + ' -- objeto sem "additionalProperties: false"');
    }
    if (!Array.isArray(no.required)) {
      problemas.push(caminho + ' -- objeto sem lista "required"');
    } else {
      for (const p of Object.keys(no.properties || {})) {
        if (!no.required.includes(p)) {
          problemas.push(caminho + '.' + p + ' -- propriedade fora de "required"');
        }
      }
    }
  }

  for (const [chave, valor] of Object.entries(no)) {
    if (valor && typeof valor === 'object') auditar(valor, caminho + '.' + chave, problemas);
  }
  return problemas;
}

let passou = 0;
function ok(nome, fn) {
  try { fn(); console.log('  ok  ' + nome); passou++; }
  catch (e) { console.log('  FALHOU  ' + nome + '\n      ' + e.message); process.exitCode = 1; }
}

console.log('validacao dos schemas de ferramenta (sem custo de API)\n');

// Os classificadores importam o SDK, que exige chave. Damos uma falsa: nada e
// enviado, so queremos o schema que o modulo constroi na carga.
process.env.ANTHROPIC_API_KEY ||= 'sk-ant-chave-falsa-apenas-para-carregar-o-modulo';

const modulos = [
  ['classificador.js', await import('./classificador.js')],
  ['classificador-tribunais.js', await import('./classificador-tribunais.js')],
];

for (const [nome, mod] of modulos) {
  const ferramenta = mod.FERRAMENTA_PARA_TESTE;

  ok(nome + ': expoe a ferramenta para inspecao', () => {
    assert.ok(ferramenta, 'exporte FERRAMENTA_PARA_TESTE para que este teste possa auditar');
  });
  if (!ferramenta) continue;

  ok(nome + ': schema sem palavra-chave proibida', () => {
    const problemas = auditar(ferramenta.input_schema);
    assert.deepEqual(problemas, [], '\n      - ' + problemas.join('\n      - '));
  });

  ok(nome + ': strict ligado e schema fechado', () => {
    assert.equal(ferramenta.strict, true, 'strict deveria ser true');
    assert.equal(ferramenta.input_schema.additionalProperties, false);
  });

  ok(nome + ': todo array declara os itens', () => {
    const faltando = [];
    (function varrer(no, caminho) {
      if (!no || typeof no !== 'object') return;
      if (no.type === 'array' && !no.items) faltando.push(caminho);
      for (const [k, v] of Object.entries(no)) {
        if (v && typeof v === 'object') varrer(v, caminho + '.' + k);
      }
    }(ferramenta.input_schema, '$'));
    assert.deepEqual(faltando, [], 'arrays sem "items": ' + faltando.join(', '));
  });
}

// O teto que saiu do schema tem de continuar existindo em algum lugar.
ok('o limite de valores sobrevive na descricao', () => {
  for (const [nome, mod] of modulos) {
    const props = mod.FERRAMENTA_PARA_TESTE.input_schema
      .properties.classificacoes.items.properties;
    for (const [campo, def] of Object.entries(props)) {
      if (def.type !== 'array') continue;
      assert.ok(
        /\bde 1 a \d|no maximo \d/i.test(def.description || ''),
        nome + ': o array "' + campo + '" perdeu o limite tambem da descricao',
      );
    }
  }
});

console.log('\n' + passou + ' verificacoes passaram');
