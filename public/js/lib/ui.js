/** Small DOM helpers shared by every view. */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  return node;
}

/**
 * Remplace le contenu d'un nœud en ignorant les enfants absents.
 * `replaceChildren` écrirait « null » en toutes lettres pour une branche
 * conditionnelle non prise ; `el` les filtre déjà, celle-ci fait de même.
 */
export function remplir(node, ...enfants) {
  node.replaceChildren(
    ...enfants
      .flat()
      .filter((enfant) => enfant !== null && enfant !== undefined && enfant !== false)
      .map((enfant) => (typeof enfant === 'string' || typeof enfant === 'number' ? document.createTextNode(String(enfant)) : enfant))
  );
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.className = kind === 'error' ? 'toast toast--error' : 'toast';
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, kind === 'error' ? 6000 : 3200);
}

/** Bottom-sheet modal. `render(close)` returns the body content. */
export function openModal(title, render) {
  const root = document.getElementById('modal-root');
  const close = () => {
    backdrop.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (event) => { if (event.key === 'Escape') close(); };

  const body = el('div');
  const modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('div', { class: 'modal__head' }, [
      el('h2', { text: title, style: { margin: '0' } }),
      el('button', { class: 'modal__close', 'aria-label': 'Fermer', onclick: close, text: '×' }),
    ]),
    body,
  ]);
  const backdrop = el('div', {
    class: 'modal-backdrop',
    onclick: (event) => { if (event.target === backdrop) close(); },
  }, [modal]);

  body.appendChild(render(close));
  root.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  modal.querySelector('input, textarea, select, button:not(.modal__close)')?.focus();
  return close;
}

export function confirmDialog(message, { confirmLabel = 'Supprimer', danger = true } = {}) {
  return new Promise((resolve) => {
    const close = openModal('Confirmation', (dismiss) =>
      el('div', { class: 'stack' }, [
        el('p', { text: message }),
        el('div', { class: 'row row--end' }, [
          el('button', { class: 'button button--ghost', text: 'Annuler', onclick: () => { dismiss(); resolve(false); } }),
          el('button', {
            class: danger ? 'button button--danger' : 'button',
            text: confirmLabel,
            onclick: () => { dismiss(); resolve(true); },
          }),
        ]),
      ])
    );
    void close;
  });
}

export function emptyState(mark, title, description, action) {
  return el('div', { class: 'empty' }, [
    el('span', { class: 'empty__mark', 'aria-hidden': 'true', text: mark }),
    el('h2', { text: title }),
    el('p', { class: 'small', text: description }),
    action || null,
  ]);
}

export function progress(label) {
  return el('div', { class: 'progress' }, [el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('span', { text: label })]);
}

/**
 * Product thumbnail. The glyph is the tile's floor rather than a replacement:
 * it shows while the image loads, the image fades in over it once decoded, and
 * a failed load simply leaves the glyph in place.
 */
export function productImage(product) {
  const box = el('div', { class: 'vignette' }, [
    el('span', { class: 'vignette__glyphe', 'aria-hidden': 'true', text: '\u25a4' }),
  ]);
  if (!product.imageUrl) return box;

  const image = el('img', { class: 'vignette__image', src: product.imageUrl, alt: '', loading: 'lazy' });
  image.addEventListener('load', () => image.classList.add('vignette__image--visible'), { once: true });
  image.addEventListener('error', () => image.remove(), { once: true });
  box.appendChild(image);
  return box;
}

export function formatPrice(value, currency = 'EUR') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}

export function uid(prefix = 'id') {
  const random = crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}
