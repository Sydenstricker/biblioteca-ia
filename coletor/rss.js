// Parser de RSS/Atom minimo, sem dependencia externa.
//
// RSS e regular o bastante para regex resolver: a alternativa seria arrastar um
// parser de XML completo para extrair quatro campos. Se algum feed quebrar isto,
// o lugar de consertar e aqui, num arquivo so.

/** Desfaz CDATA e as cinco entidades XML, nesta ordem (&amp; por ultimo). */
export function limparTexto(bruto) {
  if (!bruto) return '';
  return bruto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrair(bloco, tag) {
  const m = bloco.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
  return m ? limparTexto(m[1]) : '';
}

/** Atom guarda o link num atributo href, RSS no texto do elemento. */
function extrairLink(bloco) {
  const rss = bloco.match(/<link>([\s\S]*?)<\/link>/i);
  if (rss && limparTexto(rss[1])) return limparTexto(rss[1]);
  const atom = bloco.match(/<link[^>]*href=["']([^"']+)["']/i);
  return atom ? atom[1] : '';
}

/** Devolve [{ titulo, link, data, descricao, fonte }]. */
export function analisar(xml) {
  const blocos = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) || [];
  return blocos.map((b) => ({
    titulo: extrair(b, 'title'),
    link: extrairLink(b),
    data: extrair(b, 'pubDate') || extrair(b, 'published') || extrair(b, 'updated'),
    descricao: extrair(b, 'description') || extrair(b, 'summary') || extrair(b, 'content'),
    fonte: extrair(b, 'source'),
  })).filter((i) => i.titulo && i.link);
}

/** Busca e analisa um feed. Devolve [] em qualquer falha -- uma fonte morta nao derruba a rodada. */
export async function buscarFeed(url, { log = console.log, timeoutMs = 20000 } = {}) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; biblioteca-ia/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      log('  [rss] ' + resp.status + ' em ' + url.slice(0, 70));
      return [];
    }
    return analisar(await resp.text());
  } catch (e) {
    log('  [rss] falhou ' + url.slice(0, 60) + ': ' + e.message);
    return [];
  }
}

/** Normaliza datas de RSS (RFC 822) e Atom (ISO) para AAAA-MM-DD. */
export function normalizarData(bruta) {
  if (!bruta) return '';
  const t = Date.parse(bruta);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}
