// Esquemas SVG dos cartoes do guia.
//
// Deliberadamente NAO ha robo, androide de toga nem cerebro de circuito. Este hub
// existe em parte para desmentir o "juiz-robo da Estonia"; ilustra-lo com essa
// iconografia reforcaria justamente o imaginario que ele combate.
//
// Cada esquema mostra a TRANSFORMACAO concreta -- muitas paginas viram uma, audio
// vira texto -- que e mais didatico que um icone decorativo.
//
// Convencoes: viewBox 132x64, tudo em currentColor para herdar o tema, tracos de
// 1.5, e a etapa de maquina sempre como o retangulo tracejado do meio.

const seta = '<path d="M60 32h12" /><path d="M69 29l3 3-3 3" />';

/** Retangulo tracejado que representa a etapa automatizada. */
const caixaIA = '<rect x="46" y="22" width="20" height="20" rx="4" stroke-dasharray="3 2" opacity=".55" />';

/** Pagina generica. `linhas` desenha o texto dentro. */
function pagina(x, y, l = 3, larg = 26, alt = 32) {
  const linhas = Array.from({ length: l }, (_, i) =>
    `<path d="M${x + 4} ${y + 7 + i * 5}h${larg - 10}" opacity=".45" />`).join('');
  return `<rect x="${x}" y="${y}" width="${larg}" height="${alt}" rx="2" />${linhas}`;
}

export const DIAGRAMAS = {
  // Muitas paginas -> uma pagina curta.
  resumir: `
    <rect x="6" y="10" width="24" height="30" rx="2" opacity=".35" />
    <rect x="11" y="14" width="24" height="30" rx="2" opacity=".6" />
    ${pagina(16, 18, 5, 24, 30)}
    ${seta.replace('M60 32h12', 'M46 32h10').replace('M69 29l3 3-3 3', 'M53 29l3 3-3 3')}
    <rect x="62" y="22" width="20" height="20" rx="4" stroke-dasharray="3 2" opacity=".55" />
    <path d="M86 32h10" /><path d="M93 29l3 3-3 3" />
    ${pagina(100, 22, 2, 24, 20)}`,

  // Autos -> minuta com linha de assinatura.
  minutar: `
    ${pagina(8, 14, 4, 26, 36)}
    <path d="M40 32h10" /><path d="M47 29l3 3-3 3" />
    ${caixaIA}
    <path d="M70 32h10" /><path d="M77 29l3 3-3 3" />
    <rect x="84" y="12" width="30" height="40" rx="2" />
    <path d="M88 20h22" opacity=".45" /><path d="M88 26h22" opacity=".45" />
    <path d="M88 32h16" opacity=".45" />
    <path d="M88 44c4-5 8 5 12 0s6 2 10-2" opacity=".7" />`,

  // Formas misturadas -> agrupadas por forma.
  repetitivos: `
    <circle cx="12" cy="16" r="5" /><rect x="22" y="26" width="10" height="10" rx="1.5" />
    <circle cx="14" cy="38" r="5" /><rect x="24" y="46" width="10" height="10" rx="1.5" opacity=".8" />
    <circle cx="30" cy="12" r="5" opacity=".8" />
    <path d="M42 32h10" /><path d="M49 29l3 3-3 3" />
    ${caixaIA}
    <path d="M70 32h10" /><path d="M77 29l3 3-3 3" />
    <circle cx="92" cy="18" r="5" /><circle cx="104" cy="18" r="5" /><circle cx="116" cy="18" r="5" />
    <rect x="87" y="41" width="10" height="10" rx="1.5" /><rect x="99" y="41" width="10" height="10" rx="1.5" />
    <path d="M84 30h36" opacity=".3" stroke-dasharray="2 2" />`,

  // Pergunta em linguagem corrente -> precedentes pertinentes.
  jurisprudencia: `
    <rect x="6" y="20" width="34" height="24" rx="3" />
    <path d="M11 28h20" opacity=".45" /><path d="M11 34h14" opacity=".45" />
    <path d="M46 32h10" /><path d="M53 29l3 3-3 3" />
    ${caixaIA}
    <path d="M70 32h10" /><path d="M77 29l3 3-3 3" />
    <rect x="84" y="10" width="34" height="13" rx="2" />
    <rect x="84" y="26" width="34" height="13" rx="2" />
    <rect x="84" y="42" width="34" height="13" rx="2" opacity=".55" />
    <path d="M88 16.5h16" opacity=".4" /><path d="M88 32.5h20" opacity=".4" /><path d="M88 48.5h12" opacity=".4" />
    <circle cx="113" cy="16.5" r="4" opacity=".8" /><path d="M111 16.5l1.5 1.5 3-3" opacity=".9" />`,

  // Onda sonora -> linhas de texto.
  transcrever: `
    <path d="M8 32v-8M14 32v-14M20 32v-20M26 32v-12M32 32v-16M38 32v-6" opacity=".7" />
    <path d="M8 32v8M14 32v14M20 32v20M26 32v12M32 32v16M38 32v6" opacity=".7" />
    <path d="M46 32h10" /><path d="M53 29l3 3-3 3" />
    ${caixaIA}
    <path d="M70 32h10" /><path d="M77 29l3 3-3 3" />
    <rect x="84" y="14" width="34" height="36" rx="2" />
    <circle cx="89" cy="21" r="1.8" opacity=".6" /><path d="M94 21h20" opacity=".45" />
    <circle cx="89" cy="30" r="1.8" opacity=".6" /><path d="M94 30h16" opacity=".45" />
    <circle cx="89" cy="39" r="1.8" opacity=".6" /><path d="M94 39h20" opacity=".45" />`,

  // Nuvem de pontos -> barras.
  jurimetria: `
    <circle cx="10" cy="18" r="2" opacity=".7" /><circle cx="20" cy="30" r="2" opacity=".7" />
    <circle cx="14" cy="42" r="2" opacity=".7" /><circle cx="30" cy="14" r="2" opacity=".7" />
    <circle cx="34" cy="36" r="2" opacity=".7" /><circle cx="24" cy="48" r="2" opacity=".7" />
    <circle cx="38" cy="24" r="2" opacity=".7" /><circle cx="8" cy="32" r="2" opacity=".7" />
    <path d="M46 32h10" /><path d="M53 29l3 3-3 3" />
    ${caixaIA}
    <path d="M70 32h10" /><path d="M77 29l3 3-3 3" />
    <path d="M86 52h34" opacity=".5" />
    <rect x="88" y="38" width="7" height="14" rx="1" />
    <rect x="98" y="26" width="7" height="26" rx="1" />
    <rect x="108" y="32" width="7" height="20" rx="1" opacity=".75" />`,
};

// ---------------------------------------------------------------------------
// Grupo 2: a IA que chega ate voce.
//
// Linguagem visual PROPOSITALMENTE diferente. Os esquemas acima sao fluxos que
// voce executa -- entrada, caixa tracejada, saida. Estes sao artefatos que
// chegam prontos, com uma anomalia destacada: sem seta, sem caixa de maquina.
// A diferenca visual carrega a diferenca conceitual.
// ---------------------------------------------------------------------------

/** Marca circular de alerta, o unico elemento comum ao grupo 2. */
function alerta(cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="7.5" opacity=".9" />
    <path d="M${cx} ${cy - 4}v4.5" opacity=".9" /><circle cx="${cx}" cy="${cy + 3}" r=".8" fill="currentColor" />`;
}

Object.assign(DIAGRAMAS, {
  // Duas saidas a partir de uma fala: texto e legenda.
  acessibilidade: `
    <path d="M10 32v-6M16 32v-10M22 32v-14M28 32v-8" opacity=".7" />
    <path d="M10 32v6M16 32v10M22 32v14M28 32v8" opacity=".7" />
    <path d="M36 32h10" /><path d="M43 29l3 3-3 3" />
    ${caixaIA}
    <path d="M70 26h8" /><path d="M75 23l3 3-3 3" opacity=".8" />
    <path d="M70 40h8" /><path d="M75 37l3 3-3 3" opacity=".8" />
    <rect x="82" y="10" width="34" height="18" rx="2" />
    <path d="M86 16h24" opacity=".45" /><path d="M86 22h16" opacity=".45" />
    <rect x="82" y="36" width="34" height="18" rx="2" opacity=".8" />
    <path d="M86 42h24" opacity=".45" /><path d="M86 48h12" opacity=".45" />`,

  // Citacao de aparencia perfeita que nao existe na base oficial.
  citacaoFalsa: `
    <rect x="16" y="8" width="46" height="48" rx="2" />
    <path d="M21 16h36" opacity=".4" /><path d="M21 22h30" opacity=".4" />
    <rect x="21" y="30" width="36" height="18" rx="2" stroke-dasharray="3 2" opacity=".85" />
    <path d="M25 37h22" opacity=".5" /><path d="M25 43h14" opacity=".5" />
    <path d="M70 32h14" opacity=".5" stroke-dasharray="2 3" />
    <rect x="90" y="14" width="34" height="36" rx="2" opacity=".55" />
    <path d="M94 22h26" opacity=".3" /><path d="M94 29h20" opacity=".3" />
    <path d="M99 38l14 12M113 38l-14 12" opacity=".85" />`,

  // Linha invisivel escondida entre as visiveis.
  comandoOculto: `
    <rect x="26" y="6" width="52" height="52" rx="2" />
    <path d="M32 16h40" opacity=".45" /><path d="M32 23h34" opacity=".45" />
    <path d="M32 30h40" opacity=".45" /><path d="M32 37h28" opacity=".45" />
    <path d="M32 48h40" stroke-dasharray="2 2" opacity=".95" />
    <rect x="29" y="43" width="46" height="10" rx="2" stroke-dasharray="3 2" opacity=".7" />
    ${alerta(96, 48)}`,

  // Descontinuidade na onda: a costura da montagem.
  provaSintetica: `
    <rect x="10" y="12" width="52" height="40" rx="3" />
    <path d="M16 32l4-7 4 12 4-16 4 20 4-9" opacity=".75" />
    <path d="M36 12v40" stroke-dasharray="3 3" opacity=".9" />
    <path d="M40 32l4 6 4-14 4 10 4-4" opacity=".75" />
    <path d="M72 32h12" opacity=".5" stroke-dasharray="2 3" />
    ${alerta(100, 32)}
    <path d="M92 46h30" opacity=".3" /><path d="M96 52h22" opacity=".3" />`,

  // Muitas peticas identicas chegando de uma vez.
  massa: `
    <rect x="8" y="14" width="22" height="30" rx="2" opacity=".4" />
    <rect x="14" y="11" width="22" height="30" rx="2" opacity=".6" />
    <rect x="20" y="8" width="22" height="30" rx="2" opacity=".8" />
    <rect x="26" y="20" width="22" height="30" rx="2" />
    <path d="M30 28h14" opacity=".45" /><path d="M30 34h14" opacity=".45" /><path d="M30 40h10" opacity=".45" />
    <path d="M56 32h12" opacity=".5" stroke-dasharray="2 3" />
    <rect x="76" y="14" width="20" height="26" rx="2" opacity=".55" />
    <rect x="82" y="20" width="20" height="26" rx="2" opacity=".55" />
    <rect x="88" y="26" width="20" height="26" rx="2" opacity=".55" />
    ${alerta(114, 16)}`,
});

/** Devolve o <svg> pronto do esquema, ou string vazia se o nome nao existir. */
export function diagrama(nome) {
  const corpo = DIAGRAMAS[nome];
  if (!corpo) return '';
  return '<svg class="diagrama" viewBox="0 0 132 64" fill="none" stroke="currentColor" '
    + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
    + 'aria-hidden="true" focusable="false">' + corpo + '</svg>';
}
