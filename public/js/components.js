export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, val] of Object.entries(props)) {
    if (key === 'class') node.className = val;
    else if (key === 'dataset') Object.assign(node.dataset, val);
    else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
    else if (key.startsWith('on') && typeof val === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (val === true) node.setAttribute(key, '');
    else if (val === false || val == null) continue;
    else node.setAttribute(key, String(val));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(parent) {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
}

export function animeCard(anime) {
  const link = el('a', {
    class: 'card',
    href: `/anime/${encodeURIComponent(anime.animeId)}`,
    'data-link': '',
    'aria-label': anime.title,
  });
  const poster = el('div', { class: 'card-poster' });
  if (anime.poster) {
    const img = el('img', {
      src: anime.poster,
      alt: `Poster ${anime.title}`,
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
      width: 300,
      height: 400,
    });
    img.addEventListener('error', () => { img.style.opacity = '0'; }, { once: true });
    poster.append(img);
  }
  if (anime.status) poster.append(el('span', { class: 'card-badge' }, anime.status));
  const body = el('div', { class: 'card-body' });
  body.append(el('h3', { class: 'card-title' }, anime.title));
  link.append(poster, body);
  return link;
}

export function skeletonCard() {
  const card = el('div', { class: 'card', 'aria-hidden': 'true' });
  card.append(
    el('div', { class: 'skeleton skeleton-card' }),
    el(
      'div',
      { class: 'card-body' },
      el('div', { class: 'skeleton skeleton-line' }),
      el('div', { class: 'skeleton skeleton-line short' })
    )
  );
  return card;
}

export function skeletonGrid(count = 12) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) frag.append(skeletonCard());
  return frag;
}

export function emptyState(title, message, { action, onAction } = {}) {
  const wrap = el('div', { class: 'state' });
  wrap.append(
    el('h3', { class: 'state-title' }, title),
    el('p', { class: 'state-msg' }, message)
  );
  if (action && onAction) {
    const btn = el('button', { type: 'button', class: 'btn btn-primary' }, action);
    btn.addEventListener('click', onAction);
    wrap.append(btn);
  }
  return wrap;
}

export function errorState(title, message, onRetry) {
  const wrap = el('div', { class: 'error-state', role: 'alert' });
  wrap.append(el('h3', {}, title), el('p', { class: 'state-msg' }, message));
  if (onRetry) {
    const btn = el('button', { type: 'button', class: 'btn btn-primary' }, 'Coba lagi');
    btn.addEventListener('click', onRetry);
    wrap.append(btn);
  }
  return wrap;
}

export function sectionHead(title) {
  const head = el('div', { class: 'section-head' });
  head.append(el('h2', {}, title));
  return head;
}