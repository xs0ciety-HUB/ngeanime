import { imageSrc } from './api.js';

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

/** <img> for a poster: proxied through /api/img, swaps to a titled placeholder if the load fails. */
export function posterImage(rawUrl, alt, { eager = false } = {}) {
  const src = imageSrc(rawUrl);
  const fallback = () => el('div', { class: 'poster-fallback', role: 'img', 'aria-label': alt || 'Poster tidak tersedia' }, (alt || '?').trim().charAt(0).toUpperCase() || '?');
  if (!src) return fallback();

  const img = el('img', { src, alt: alt || '', decoding: 'async', referrerpolicy: 'no-referrer' });
  if (!eager) img.setAttribute('loading', 'lazy');
  let retried = false;
  img.addEventListener('error', () => {
    if (!retried) {
      retried = true;
      img.src = `${src}${src.includes('&_r=') ? '' : '&_r=1'}`;
      return;
    }
    img.replaceWith(fallback());
  });
  return img;
}

export function animeCard(anime) {
  const href = anime.animeId ? `/anime/${encodeURIComponent(anime.animeId)}` : `/watch/${encodeURIComponent(anime.episodeId)}`;
  const link = el('a', { class: 'card', href, 'data-link': '' });
  const poster = el('div', { class: 'card-poster' });
  poster.append(posterImage(anime.poster, anime.title));
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