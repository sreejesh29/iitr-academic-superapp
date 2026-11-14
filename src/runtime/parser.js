// Build-time parser for the .dc.html screen files exported from Claude Design.
// It turns one file into plain data: the template tree, the screen's CSS,
// its prop defaults and the source of its logic class. Runs in Node (Vite plugin).
import { decodeHTML } from 'entities';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

// A small, forgiving HTML tokenizer. Unlike a browser's parser it keeps attribute
// case (onClick, viewBox, autoComplete) and never re-parents elements, so the tree
// matches what was authored.
export function parseHTML(src) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  const pushText = (t) => {
    if (!t) return;
    top().children.push({ type: 'text', value: decodeHTML(t) });
  };

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { pushText(src.slice(i)); break; }
    pushText(src.slice(i, lt));
    i = lt;

    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end === -1 ? src.length : end + 3;
      continue;
    }
    if (src.startsWith('<!', i)) { // doctype
      const end = src.indexOf('>', i);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (src.startsWith('</', i)) {
      const end = src.indexOf('>', i);
      const name = src.slice(i + 2, end).trim().toLowerCase();
      i = end + 1;
      // pop to the matching open element (ignore stray closers)
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag.toLowerCase() === name) { stack.length = k; break; }
      }
      continue;
    }
    const m = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(src.slice(i, i + 64));
    if (!m) { pushText('<'); i += 1; continue; }
    const tag = m[1];
    i += m[0].length;

    // attributes
    const attrs = [];
    let selfClose = false;
    while (i < src.length) {
      while (/\s/.test(src[i])) i++;
      if (src[i] === '>') { i++; break; }
      if (src[i] === '/' && src[i + 1] === '>') { selfClose = true; i += 2; break; }
      const nm = /^[^\s=>/]+/.exec(src.slice(i, i + 256));
      if (!nm) { i++; continue; }
      const name = nm[0];
      i += name.length;
      while (/\s/.test(src[i])) i++;
      let value = '';
      let hasValue = false;
      if (src[i] === '=') {
        hasValue = true;
        i++;
        while (/\s/.test(src[i])) i++;
        const q = src[i];
        if (q === '"' || q === "'") {
          const end = src.indexOf(q, i + 1);
          value = src.slice(i + 1, end);
          i = end + 1;
        } else {
          const uv = /^[^\s>]+/.exec(src.slice(i));
          value = uv ? uv[0] : '';
          i += value.length;
        }
      }
      attrs.push([name, hasValue ? decodeHTML(value) : '']);
    }

    const el = { type: 'el', tag, attrs, children: [] };
    top().children.push(el);
    const lower = tag.toLowerCase();
    if (VOID.has(lower) || selfClose) continue;
    if (RAW.has(lower)) {
      const re = new RegExp('</' + lower + '\\s*>', 'i');
      const rest = src.slice(i);
      const mm = re.exec(rest);
      const end = mm ? mm.index : rest.length;
      const raw = rest.slice(0, end);
      if (raw) el.children.push({ type: 'text', value: lower === 'textarea' || lower === 'title' ? decodeHTML(raw) : raw });
      i += end + (mm ? mm[0].length : 0);
      continue;
    }
    stack.push(el);
  }
  return root;
}

function find(node, pred) {
  if (node.type === 'el' && pred(node)) return node;
  for (const c of node.children || []) {
    const r = find(c, pred);
    if (r) return r;
  }
  return null;
}

const attr = (el, name) => {
  const a = el.attrs.find(([n]) => n === name);
  return a ? a[1] : undefined;
};

// Drop comments-only whitespace noise at the edges and compact the tree for JSON.
function compact(node) {
  if (node.type === 'text') return node.value;
  return [node.tag, Object.fromEntries(node.attrs), (node.children || []).map(compact)];
}

export function parseDC(source, fileName) {
  const doc = parseHTML(source);
  const xdc = find(doc, (n) => n.tag.toLowerCase() === 'x-dc');
  if (!xdc) throw new Error(fileName + ': no <x-dc> element');
  const titleEl = find(doc, (n) => n.tag.toLowerCase() === 'title');
  const script = find(doc, (n) => n.tag.toLowerCase() === 'script' && attr(n, 'type') === 'text/x-dc');
  if (!script) throw new Error(fileName + ': no logic script');

  // Helmet: collect CSS (fonts are loaded once in index.html)
  let css = '';
  const body = [];
  for (const c of xdc.children) {
    if (c.type === 'el' && c.tag.toLowerCase() === 'helmet') {
      for (const h of c.children) {
        if (h.type === 'el' && h.tag.toLowerCase() === 'style') css += h.children.map((t) => t.value).join('') + '\n';
      }
    } else {
      body.push(c);
    }
  }

  let props = {};
  const dp = attr(script, 'data-props');
  if (dp) {
    try { props = JSON.parse(dp); } catch (e) { throw new Error(fileName + ': bad data-props JSON: ' + e.message); }
  }
  const defaults = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith('$')) continue;
    if (v && typeof v === 'object' && 'default' in v) defaults[k] = v.default;
  }

  return {
    title: titleEl ? titleEl.children.map((t) => t.value).join('').trim() : fileName,
    css,
    defaults,
    preview: props.$preview || null,
    template: body.map(compact),
    code: script.children.map((t) => t.value).join('')
  };
}
