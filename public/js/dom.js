// Safe DOM helpers: external text only ever goes through text nodes / setAttribute.
const IMG_HOST = 'cdn.myanimelist.net';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function safeImageUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === IMG_HOST ? u.href : null;
  } catch { return null; }
}

export function poster(title, url, eager = false) {
  const img = h('img', { class: 'poster', width: 225, height: 318, alt: `Poster ${title}`, loading: eager ? 'eager' : 'lazy', decoding: 'async' });
  const src = safeImageUrl(url);
  if (src) img.src = src;
  return img;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}
