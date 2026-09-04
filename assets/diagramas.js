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

/** Devolve o <svg> pronto do esquema, ou string vazia se o nome nao existir. */
export function diagrama(nome) {
  const corpo = DIAGRAMAS[nome];
  if (!corpo) return '';
  return '<svg class="diagrama" viewBox="0 0 132 64" fill="none" stroke="currentColor" '
    + 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
    + 'aria-hidden="true" focusable="false">' + corpo + '</svg>';
}
