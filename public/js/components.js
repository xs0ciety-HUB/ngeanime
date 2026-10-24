export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (key === 'class') node.className = val;
    else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
    else if (val === true) node.setAttribute(key, '');
    else if (val === false || val == null) continue;
    else node.setAttribute(key, String(val));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(parent) { while (parent.firstChild) parent.removeChild(parent.firstChild); }

export function animeCard(anime) {
  const link = el('a', { class: 'card', href: `/anime/${encodeURIComponent(anime.animeId)}`, 'data-link': '' });
  const poster = el('div', { class: 'card-poster' });
  if (anime.poster) {
    poster.append(el('img', { src: anime.poster, alt: anime.title, loading: 'lazy', referrerpolicy: 'no-referrer' }));
  }
  if (anime.status) poster.append(el('span', { class: 'card-badge' }, anime.status));
  link.append(poster, el('div', { class: 'card-body' }, el('h3', { class: 'card-title' }, anime.title)));
  return link;
}

export function skeletonGrid(count = 12) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    frag.append(el('div', { class: 'card', 'aria-hidden': 'true' }, el('div', { class: 'skeleton skeleton-card' }), el('div', { class: 'card-body' }, el('div', { class: 'skeleton skeleton-line' }))));
  }
  return frag;
}

export function emptyState(title, message) {
  return el('div', { class: 'state' }, el('h3', { class: 'state-title' }, title), el('p', { class: 'state-msg' }, message));
}

export function errorState(title, message, onRetry) {
  const wrap = el('div', { class: 'error-state' }, el('h3', {}, title), el('p', { class: 'state-msg' }, message));
  if (onRetry) wrap.append(el('button', { type: 'button', class: 'btn btn-primary', onclick: onRetry }, 'Coba lagi'));
  return wrap;
}

export function sectionHead(title) { return el('div', { class: 'section-head' }, el('h2', {}, title)); }