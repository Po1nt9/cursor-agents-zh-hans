/**
 * DOM half of the runtime. Observes mutations and translates only touched nodes.
 * No imports, so the patcher can inline this file into the workbench page.
 */

export const TRANSLATABLE_ATTRS = [
  'title',
  'placeholder',
  'aria-label',
  'aria-description',
  'aria-placeholder',
];

export function startDomTranslator(api, env) {
  const { translateText, shouldSkipElement, dictionary, version } = api;
  const document = env.document;
  const MutationObserver = env.MutationObserver;
  const host = env.window || env.globalThis || {};
  if (!document || typeof MutationObserver !== 'function') {
    throw new Error('运行环境缺少 document 或 MutationObserver');
  }
  if (host.__cursorZhHansInstalled) {
    return { already: true, disconnect() {} };
  }
  host.__cursorZhHansInstalled = true;
  host.__cursorZhHans = { version: version || '0.1.0' };

  const textMemo = new WeakMap();
  const attrMemo = new WeakMap();
  const observed = new WeakSet();

  function translateTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;
    if (textMemo.get(node) === node.nodeValue) return;
    const result = translateText(node.nodeValue, dictionary);
    if (!result.changed || result.text === node.nodeValue) {
      textMemo.set(node, node.nodeValue);
      return;
    }
    node.nodeValue = result.text;
    textMemo.set(node, result.text);
  }

  function translateAttrs(el) {
    if (!el || el.nodeType !== 1 || typeof el.getAttribute !== 'function') return;
    if (shouldSkipElement(el)) return;
    let memo = attrMemo.get(el);
    if (!memo) {
      memo = Object.create(null);
      attrMemo.set(el, memo);
    }
    for (const attr of TRANSLATABLE_ATTRS) {
      if (typeof el.hasAttribute === 'function' && !el.hasAttribute(attr)) continue;
      const raw = el.getAttribute(attr);
      if (raw == null || memo[attr] === raw) continue;
      const result = translateText(raw, dictionary);
      if (!result.changed || result.text === raw) {
        memo[attr] = raw;
        continue;
      }
      el.setAttribute(attr, result.text);
      memo[attr] = result.text;
    }
  }

  function walk(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      translateTextNode(node);
      return;
    }
    if (node.nodeType === 11) {
      const children = node.childNodes || [];
      for (let i = 0; i < children.length; i += 1) walk(children[i]);
      return;
    }
    if (node.nodeType !== 1) return;
    if (shouldSkipElement(node)) return;
    translateAttrs(node);
    if (node.shadowRoot) {
      observe(node.shadowRoot);
      walk(node.shadowRoot);
    }
    const children = node.childNodes || [];
    for (let i = 0; i < children.length; i += 1) walk(children[i]);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        translateTextNode(record.target);
      } else if (record.type === 'attributes') {
        translateAttrs(record.target);
      } else if (record.type === 'childList') {
        const added = record.addedNodes || [];
        for (let i = 0; i < added.length; i += 1) walk(added[i]);
      }
    }
  });

  const options = {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS.slice(),
  };

  function observe(root) {
    if (!root || observed.has(root)) return;
    observed.add(root);
    observer.observe(root, options);
  }

  const Element = env.Element;
  let restoreAttach;
  if (Element && Element.prototype && typeof Element.prototype.attachShadow === 'function') {
    const original = Element.prototype.attachShadow;
    if (!original.__cursorZhHans) {
      function wrapped(init) {
        const shadow = original.call(this, init);
        observe(shadow);
        return shadow;
      }
      wrapped.__cursorZhHans = true;
      try {
        Element.prototype.attachShadow = wrapped;
        restoreAttach = () => {
          if (Element.prototype.attachShadow === wrapped) {
            Element.prototype.attachShadow = original;
          }
        };
      } catch {
        // Some embeds freeze Element.prototype. Translation of light DOM still runs.
      }
    }
  }

  const target = document.documentElement || document.body;
  if (target) observe(target);
  if (document.body) walk(document.body);

  return {
    already: false,
    observer,
    disconnect() {
      observer.disconnect();
      if (restoreAttach) restoreAttach();
      host.__cursorZhHansInstalled = false;
    },
  };
}
