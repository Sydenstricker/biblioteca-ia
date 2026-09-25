// Carimbo de "ultima rodada" no rodape.
//
// Serve para um problema especifico: agora que o coletor publica sozinho, um mes
// tranquilo e um coletor quebrado se parecem -- os dois sao silencio. O GitHub
// ainda desativa cron de repositorio publico parado por 60 dias, e quando faz isso
// derruba o workflow inteiro, inclusive o botao "Run workflow".
//
// O arquivo lido aqui e gravado a CADA rodada, mesmo quando nao ha novidade. Se a
// data na tela envelhecer, o coletor parou -- e voce descobre olhando, sem depender
// de e-mail nenhum. Reativar e um clique na aba Actions.

const MS_POR_DIA = 864e5;

/** "2026-10-01" -> "1 de outubro de 2026", sem fuso para nao errar o dia. */
function porExtenso(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return dia + ' de ' + meses[mes - 1] + ' de ' + ano;
}

/**
 * Escreve o carimbo no elemento dado. Falha em silencio de proposito: se o arquivo
 * ainda nao existe (repositorio recem-clonado, primeira rodada), o rodape fica
 * vazio como era antes -- e melhor nao dizer nada do que dizer uma data errada.
 */
export async function carimbar(seletor, caminho) {
  const alvo = document.querySelector(seletor);
  if (!alvo) return;

  let dados;
  try {
    const resposta = await fetch(caminho);
    if (!resposta.ok) return;
    dados = await resposta.json();
  } catch { return; }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.rodada || '')) return;

  const texto = document.createElement('span');
  texto.textContent = 'Atualizado em ' + porExtenso(dados.rodada);
  alvo.replaceChildren(texto);

  // Dois meses sem rodada nao e mes tranquilo: o cron caiu. O aviso aparece na
  // propria pagina porque e onde voce ja esta olhando.
  const dias = (Date.now() - Date.parse(dados.rodada + 'T12:00:00Z')) / MS_POR_DIA;
  if (dias > 62) {
    const alerta = document.createElement('strong');
    alerta.className = 'rodape-alerta';
    alerta.textContent = ' — o coletor não roda há mais de dois meses; '
      + 'verifique a aba Actions do repositório';
    alvo.append(alerta);
  }
}
