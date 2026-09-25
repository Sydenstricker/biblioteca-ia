// DOM minimo em memoria, para testar os frontends sem navegador.
//
// Nao e um jsdom: implementa exatamente a superficie que assets/app.js e
// assets/tribunais.js usam, e nada mais. Quando um teste falhar com
// "x is not a function", o conserto costuma ser aqui, nao no app.


/** classList com a mesma superficie que app.js usa: has, add, toggle(nome, forca). */
function criarClassList() {
  const conjunto = new Set();
  conjunto.toggle = (nome, forca) => {
    const ligar = forca === undefined ? !conjunto.has(nome) : forca;
    ligar ? conjunto.add(nome) : conjunto.delete(nome);
  };
  return conjunto;
}

export class Elemento {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.filhos = [];
    this.dataset = {};
    this.classList = criarClassList();
    this._texto = '';
    this._html = '';
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.ouvintes = {};
  }

  get className() { return [...this.classList].join(' '); }
  set className(v) {
    this.classList = criarClassList();
    for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c);
  }

  /** Sobe ate um ancestral com a classe pedida. O stub nao mantem parentesco,
   *  entao devolve a si mesmo: basta para o app so ler/escrever .hidden nele. */
  closest() { return this; }

  /** So precisa suportar seletor de classe unica, que e o que app.js usa. */
  querySelector(sel) {
    return this.buscarTodos(sel.replace(/^\./, ''))[0] ?? null;
  }

  set textContent(v) { this._texto = String(v); this.filhos = []; }
  get textContent() {
    return this._texto + this.filhos.map((f) => (typeof f === 'string' ? f : f.textContent)).join('');
  }

  set innerHTML(v) { this._html = String(v); this.filhos = []; }
  get innerHTML() { return this._html; }

  append(...nos) { this.filhos.push(...nos); }

  /** Troca todo o conteudo de uma vez. Usado por assets/carimbo.js. */
  replaceChildren(...nos) { this._texto = ""; this.filhos = [...nos]; }
  addEventListener(evt, fn) { (this.ouvintes[evt] ||= []).push(fn); }
  disparar(evt, arg) { for (const fn of this.ouvintes[evt] || []) fn(arg); }

  get classes() { return this.classList; }

  /** Como no DOM real: so nos-elemento, sem os de texto. */
  get children() { return this.filhos.filter((f) => typeof f !== 'string'); }

  /** Percorre a arvore procurando por classe. */
  buscarTodos(classe, achados = []) {
    for (const f of this.filhos) {
      if (typeof f === 'string') continue;
      if (f.classList.has(classe)) achados.push(f);
      f.buscarTodos(classe, achados);
    }
    return achados;
  }
}

/** Monta document/location/history/localStorage globais e devolve o mapa de ids. */
export function montarDom(ids) {
  const porId = {};
  for (const id of ids) porId[id] = new Elemento();

  const principal = new Elemento('main');
  const raizDoc = new Elemento('html');
  raizDoc.dataset = {};

  globalThis.document = {
    documentElement: raizDoc,
    querySelector: (sel) => {
      if (sel === 'main') return principal;
      return porId[sel.replace('#', '')] ?? null;
    },
    querySelectorAll: (sel) => {
      const m = sel.match(/data-campo="([^"]+)"/);
      if (!m) return [];
      return porId.filtros.buscarTodos('opcao').filter((e) => e.dataset.campo === m[1]);
    },
    createElement: (tag) => new Elemento(tag),
    // append() ja aceita string; um no de texto pode ser a propria string.
    createTextNode: (t) => String(t),
    createDocumentFragment: () => new Elemento('fragment'),
  };

  globalThis.location = { search: '', pathname: '/' };
  globalThis.history = { replaceState: (_a, _b, url) => { globalThis._ultimaUrl = url; } };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.window = { scrollTo: () => {} };

  porId._main = principal;
  return porId;
}
