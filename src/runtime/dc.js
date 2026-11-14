// Lightweight runtime for the Claude Design screen format (.dc.html).
// Each screen file is compiled at build time (see vite.config.js) into
// { template, css, defaults, factory }. Here we turn that into a React component:
// the logic class supplies renderVals(), the template is rendered from it.
import React from 'react';
import { assetFor } from '../assets.js';

const registry = Object.create(null);
export const getScreen = (name) => registry[name];
export const hasScreen = (name) => name in registry;

/* ---------- holes: {{ path }} ---------- */

const HOLE = /\{\{\s*([^}]*?)\s*\}\}/g;
const WHOLE = /^\s*\{\{\s*([^}]*?)\s*\}\}\s*$/;

function lookup(expr, scope) {
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null') return null;
  if (expr === 'undefined' || expr === '') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
  if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
  let v = scope;
  for (const part of expr.split('.')) {
    if (v == null) return undefined;
    v = v[part];
  }
  return v;
}

const str = (v) => (v == null || v === false ? '' : String(v));

// Attribute value: a whole-value hole keeps its raw type (function, number, bool),
// anything else is an interpolated string.
function attrValue(raw, scope) {
  const m = WHOLE.exec(raw);
  if (m) return lookup(m[1], scope);
  if (raw.indexOf('{{') === -1) return raw;
  return raw.replace(HOLE, (_, e) => str(lookup(e, scope)));
}

/* ---------- attribute / style mapping ---------- */

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

const NAME_MAP = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  inputmode: 'inputMode',
  spellcheck: 'spellCheck',
  autocapitalize: 'autoCapitalize',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  'xlink:href': 'xlinkHref',
  'xml:space': 'xmlSpace'
};
const BOOL_ATTRS = new Set(['disabled', 'checked', 'selected', 'readOnly', 'required', 'multiple', 'autoFocus', 'hidden', 'open', 'novalidate', 'noValidate']);

function propName(name) {
  if (NAME_MAP[name]) return NAME_MAP[name];
  if (name.startsWith('aria-') || name.startsWith('data-')) return name;
  if (/^on[a-z]/.test(name)) return 'on' + name[2].toUpperCase() + name.slice(3);
  if (name.includes('-')) return camel(name); // stroke-width -> strokeWidth
  return name;
}

const styleCache = new Map();
function parseStyle(text) {
  if (styleCache.has(text)) return styleCache.get(text);
  const out = {};
  let depth = 0, quote = null, start = 0;
  const decls = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) { decls.push(text.slice(start, i)); start = i + 1; }
  }
  decls.push(text.slice(start));
  for (const d of decls) {
    const c = d.indexOf(':');
    if (c === -1) continue;
    let prop = d.slice(0, c).trim();
    const val = d.slice(c + 1).trim();
    if (!prop || val === '') continue;
    if (!prop.startsWith('--')) {
      if (prop.startsWith('-ms-')) prop = 'ms-' + prop.slice(4);
      else if (prop.startsWith('-')) prop = prop.slice(1).replace(/^./, (x) => x.toUpperCase());
      prop = camel(prop);
    }
    out[prop] = val;
  }
  if (styleCache.size > 5000) styleCache.clear();
  styleCache.set(text, out);
  return out;
}

/* ---------- images that lived inside Claude Design ---------- */

function BlobImg(props) {
  const { src, style, ...rest } = props;
  const asset = assetFor(src);
  const [failed, setFailed] = React.useState(false);
  if (!asset) return React.createElement('img', props);
  if (failed || !asset.src) {
    // Real file not added yet: show the placeholder filling its box.
    return React.createElement('img', {
      ...rest,
      src: asset.placeholder,
      style: { ...style, position: style && style.position === 'absolute' ? 'absolute' : style && style.position, left: 0, top: 0, width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover' }
    });
  }
  return React.createElement('img', { ...rest, style, src: asset.src, onError: () => setFailed(true) });
}

/* ---------- template rendering ---------- */

const NO_WS_PARENTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'select', 'ul', 'ol', 'dl']);

function renderChildren(children, scope, parentTag, keyPrefix) {
  const out = [];
  for (let i = 0; i < children.length; i++) {
    const r = renderNode(children[i], scope, parentTag, keyPrefix + '.' + i);
    if (r === null || r === undefined) continue;
    out.push(r);
  }
  return out;
}

function renderNode(node, scope, parentTag, key) {
  if (typeof node === 'string') {
    if (!node.trim()) {
      if (NO_WS_PARENTS.has(parentTag)) return null;
      return node.includes('\n') ? ' ' : node;
    }
    return node.indexOf('{{') === -1 ? node : node.replace(HOLE, (_, e) => str(lookup(e, scope)));
  }
  const [tag, attrs, children] = node;
  const lower = tag.toLowerCase();

  if (lower === 'sc-if') {
    const v = attrValue(attrs.value ?? '', scope);
    if (!v) return null;
    return React.createElement(React.Fragment, { key }, renderChildren(children, scope, parentTag, key));
  }
  if (lower === 'sc-for') {
    const list = attrValue(attrs.list ?? '', scope);
    const as = attrs.as || 'item';
    if (!Array.isArray(list) || !list.length) return null;
    return React.createElement(
      React.Fragment,
      { key },
      list.map((item, idx) =>
        React.createElement(
          React.Fragment,
          { key: idx },
          renderChildren(children, { ...scope, [as]: item, $index: idx }, parentTag, key + ':' + idx)
        )
      )
    );
  }
  if (lower === 'dc-import') {
    const Comp = registry[attrs.name];
    if (!Comp) {
      console.warn('Missing screen component:', attrs.name);
      return null;
    }
    const p = { key };
    for (const [n, raw] of Object.entries(attrs)) {
      if (n === 'name' || n.startsWith('hint-')) continue;
      p[camel(n)] = attrValue(raw, scope);
    }
    return React.createElement(Comp, p);
  }
  if (lower === 'helmet') return null;

  const props = { key };
  for (const [n, raw] of Object.entries(attrs)) {
    if (n.startsWith('hint-')) continue;
    const name = propName(n);
    let v = attrValue(raw, scope);
    if (name === 'style') {
      if (typeof v === 'string') v = parseStyle(v);
      props.style = v;
      continue;
    }
    if (BOOL_ATTRS.has(name)) {
      if (v === '' || v === name || v === n) v = true;
      else if (v === 'false') v = false;
    }
    if (/^on[A-Z]/.test(name) && typeof v !== 'function') continue;
    if (v === undefined) continue;
    if (name.startsWith('aria-') && typeof v === 'boolean') v = String(v);
    props[name] = v;
  }

  if (lower === 'img' && typeof props.src === 'string' && props.src.startsWith('/_blob/')) {
    return React.createElement(BlobImg, props);
  }
  if (lower === 'a' && typeof props.href === 'string' && /^https?:/.test(props.href)) {
    props.target = '_blank';
    props.rel = 'noopener noreferrer';
  }
  // Controlled inputs whose bound value is missing would flip to uncontrolled; keep them controlled.
  if ((lower === 'input' || lower === 'textarea') && 'value' in attrs && props.value === undefined && props.onChange) {
    props.value = '';
  }

  if (lower === 'textarea' && children.length) {
    const text = children.map((c) => (typeof c === 'string' ? renderNode(c, scope, lower, key) : '')).join('');
    if (!('value' in props) && !('defaultValue' in props)) props.defaultValue = text;
    return React.createElement(tag, props);
  }
  if (lower === 'input' || lower === 'img' || lower === 'br' || lower === 'hr' || lower === 'meta' || lower === 'link') {
    return React.createElement(tag, props);
  }
  if (lower === 'style') {
    return React.createElement('style', { key, dangerouslySetInnerHTML: { __html: children.join('') } });
  }
  const kids = renderChildren(children, scope, lower, key);
  return React.createElement(tag, props, ...kids);
}

/* ---------- logic base class ---------- */

export class DCLogic extends React.Component {
  renderVals() {
    return {};
  }
  render() {
    const def = this.constructor.__dc;
    let vals;
    try {
      vals = this.renderVals() || {};
    } catch (e) {
      console.error('[' + def.name + '] renderVals failed', e);
      throw e;
    }
    const scope = { ...vals };
    const nodes = renderChildren(def.template, scope, 'div', def.name);
    return React.createElement(
      React.Fragment,
      null,
      def.css ? React.createElement('style', { dangerouslySetInnerHTML: { __html: def.css } }) : null,
      ...nodes
    );
  }
}

// Called by each compiled screen module.
export function defineDC(def) {
  class Base extends DCLogic {}
  Base.__dc = def;
  const Logic = def.factory(Base);
  Logic.__dc = def;
  const defaults = def.defaults || {};
  function Screen(props) {
    return React.createElement(Logic, { ...defaults, ...props });
  }
  Screen.displayName = def.name;
  Screen.title = def.title;
  Screen.preview = def.preview;
  registry[def.name] = Screen;
  return Screen;
}
