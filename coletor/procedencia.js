// Decide `verificacao` pelo DOMINIO de quem publicou, nao por julgamento do LLM.
//
// POR QUE ISTO EXISTE
//
// A pergunta "isto e fonte primaria?" nao e sobre o conteudo, e sobre quem
// assinou a publicacao -- e isso o dominio responde de forma deterministica,
// gratuita e auditavel. Pedir ao modelo que adivinhe era pior em todos os
// eixos: custava tokens, variava entre rodadas, e errava para o lado perigoso
// (uma reportagem bem escrita sobre um tribunal era promovida a "confirmado
// oficialmente").
//
// A REGRA DE OURO: o dominio so PROMOVE a primaria. Nada mais promove.
// O LLM pode apenas REBAIXAR, marcando `contestado` ou `desmentido`, que sao
// juizos sobre disputa factual e nao sobre autoria. Assim o pior erro possivel
// e subestimar a procedencia de algo -- nunca afirmar oficialidade inexistente.

/**
 * Dominios que falam por si mesmos: o orgao publicando sobre o proprio sistema.
 * Sufixos, entao `.jus.br` cobre stf.jus.br, tjrj.jus.br, noticias.stf.jus.br etc.
 */
const OFICIAIS = [
  // --- Brasil: os dominios sao regulados, entao a regra e solida ---
  '.jus.br',   // todo o Poder Judiciario (STF, STJ, CNJ, TJs, TRFs, TRTs, TSE)
  '.mp.br',    // Ministerio Publico
  '.def.br',   // Defensoria Publica
  '.leg.br',   // Poder Legislativo
  '.gov.br',   // Poder Executivo

  // --- governos estrangeiros ---
  '.gov',       // EUA (uscourts.gov, supremecourt.gov)
  '.gov.uk',
  '.gc.ca',     // Canada
  '.gob.ar', '.gob.mx', '.gob.cl', '.gov.co',
  '.gov.pt',
  '.court.gov.cn', 'court.gov.cn',
  'justdigi.ee', 'ekei.ee',           // Ministerio da Justica da Estonia
  'curia.europa.eu',

  // --- organismos internacionais ---
  '.europa.eu',
  'coe.int', '.coe.int',              // Conselho da Europa / CEPEJ
  'rm.coe.int',
  'un.org', '.un.org', 'unodc.org',
  'oecd.org', 'oecd.ai',
];

/**
 * Repositorios em que o link E a propria obra, nao alguem falando sobre ela.
 * Vale para itens do tipo `artigo`.
 */
const OBRA_ACADEMICA = [
  'doi.org',
  'arxiv.org',
  'openalex.org',
  'ssrn.com', 'papers.ssrn.com',
  'scielo.br', '.scielo.br', 'scielo.org',
  'pubmed.ncbi.nlm.nih.gov',
];

/** Normaliza para o host, sem www. Devolve '' se a URL for impronunciavel. */
export function hostDe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Casa host contra um padrao de sufixo.
 *
 * O apex precisa de tratamento proprio: para o padrao ".gov.br", o host
 * "www.gov.br" vira "gov.br" ao perder o www, e "gov.br".endsWith(".gov.br")
 * e falso. Sem esta linha, o portal do governo federal escapava da regra.
 */
function casa(host, lista) {
  return lista.some((p) => {
    const sufixo = p.startsWith('.') ? p : '.' + p;
    const apex = p.startsWith('.') ? p.slice(1) : p;
    return host === apex || host.endsWith(sufixo);
  });
}

/**
 * Classifica a procedencia de uma URL.
 * Devolve { verificacao, host, motivo } -- `motivo` e o que aparece no PR para
 * voce conferir a decisao sem precisar abrir o link.
 */
export function classificarProcedencia(url, { tipo = 'noticia' } = {}) {
  const host = hostDe(url);

  if (!host) {
    return { verificacao: 'fonte_secundaria', host: '', motivo: 'URL ilegivel; assumindo o grau menor' };
  }
  if (casa(host, OFICIAIS)) {
    return { verificacao: 'fonte_primaria', host, motivo: 'dominio institucional (' + host + ')' };
  }
  if (tipo === 'artigo' && casa(host, OBRA_ACADEMICA)) {
    return { verificacao: 'fonte_primaria', host, motivo: 'link para a propria obra (' + host + ')' };
  }
  return { verificacao: 'fonte_secundaria', host, motivo: 'dominio nao institucional (' + host + ')' };
}

/**
 * Combina a regra de dominio com o palpite do LLM.
 *
 * O dominio manda em primaria/secundaria. O LLM so e ouvido quando aponta
 * disputa factual -- e `desmentido`/`contestado` valem sobre qualquer dominio,
 * inclusive um oficial (um orgao pode publicar algo que depois se mostra falso).
 */
export function resolverVerificacao(url, palpiteDoLlm, { tipo = 'noticia' } = {}) {
  const base = classificarProcedencia(url, { tipo });

  if (palpiteDoLlm === 'desmentido' || palpiteDoLlm === 'contestado') {
    return { ...base, verificacao: palpiteDoLlm, motivo: base.motivo + '; rebaixado pelo classificador para ' + palpiteDoLlm };
  }
  return base;
}
