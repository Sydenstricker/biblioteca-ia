// Fonte de noticias sobre IA no Judiciario.
//
// Google News RSS e o motor: cobre CNJ, STF, STJ e os TJs indiretamente, ja que
// agrega os portais deles. O CNJ nao publica RSS proprio (o /feed/ devolve HTML),
// entao a agregacao e o caminho.
//
// Eixo Brasil em primeiro plano: as consultas em portugues sao a maioria, e as em
// ingles trazem o contraponto internacional.

import { buscarFeed, normalizarData } from '../rss.js';
import { hostDe } from '../procedencia.js';

const BASE_GN = 'https://news.google.com/rss/search?q=';

const CONSULTAS_BR = [
  '"inteligência artificial" tribunal justiça',
  '"inteligência artificial" CNJ Judiciário',
  '"inteligência artificial" STF OR STJ processo',
  '"inteligência artificial" magistrado sentença',
  'IA generativa Judiciário advogado alucinação',
];

const CONSULTAS_INTL = [
  'artificial intelligence courts judiciary ruling',
  'AI judge court decision controversy',
];

const JANELA_DIAS = 30;

export const nome = 'noticias-tribunais';

function urlGoogleNews(consulta, idioma) {
  const locale = idioma === 'pt'
    ? '&hl=pt-BR&gl=BR&ceid=BR:pt-419'
    : '&hl=en-US&gl=US&ceid=US:en';
  return BASE_GN + encodeURIComponent(consulta) + locale;
}

export async function coletar({ log = console.log, limitePorConsulta = 12 } = {}) {
  const corte = Date.now() - JANELA_DIAS * 864e5;
  const encontrados = new Map();

  const feeds = [
    ...CONSULTAS_BR.map((c) => ({ url: urlGoogleNews(c, 'pt'), rotulo: 'GN/pt: ' + c, idioma: 'pt' })),
    ...CONSULTAS_INTL.map((c) => ({ url: urlGoogleNews(c, 'en'), rotulo: 'GN/en: ' + c, idioma: 'en' })),
  ];
  // O RSS do Conjur foi testado e removido: e um feed geral de 10 itens, quase
  // nunca com IA no instante da coleta -- e o Google News ja o indexa.

  for (const feed of feeds) {
    const itens = await buscarFeed(feed.url, { log });
    let aceitos = 0;

    for (const it of itens.slice(0, limitePorConsulta)) {
      const data = normalizarData(it.data);
      if (data && Date.parse(data) < corte) continue;

      // O Google News anexa " - Veiculo" ao titulo; separamos para ter o veiculo.
      const partes = it.titulo.split(/\s+-\s+(?=[^-]+$)/);
      const titulo = partes.length > 1 ? partes[0] : it.titulo;
      const veiculo = it.fonte || (partes.length > 1 ? partes[1] : feed.rotulo.split(':')[0]);

      if (encontrados.has(it.link)) continue;
      encontrados.set(it.link, {
        nome: titulo.slice(0, 160),
        url: it.link,
        descricao: 'Manchete: ' + titulo + '\nVeiculo: ' + veiculo
          + '\nData: ' + (data || 'nao informada')
          + (it.descricao ? '\nResumo: ' + it.descricao.slice(0, 500) : ''),
        fonte_url: it.link,
        _tipoAlvo: 'noticia',
        _idioma: feed.idioma,
        // O <link> do Google News esconde quem publicou; o <source url> revela.
        // E dele que sai a decisao automatica de fonte primaria vs secundaria.
        _urlVeiculo: it.urlFonte || it.link,
        sinais: { veiculo, data_publicacao: data, dominio_veiculo: hostDe(it.urlFonte || '') },
      });
      aceitos++;
    }
    log('  [noticias] ' + feed.rotulo.slice(0, 46) + ': ' + aceitos);
  }

  return [...encontrados.values()];
}
