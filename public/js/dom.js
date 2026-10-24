const IMG_HOST = 'cdn.myanimelist.net';
const FALLBACK_IMG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="225" height="318" viewBox="0 0 225 318"><rect width="225" height="318" fill="%231d2040"/><path d="M112.5 129c-11 0-20 9-20 20s9 20 20 20 20-9 20-20-9-20-20-20zm0 30c-5.5 0-10-4.5-10-10s4.5-10 10-10 10 4.5 10 10-4.5 10-10 10z" fill="%2331365c"/><text x="112.5" y="200" font-family="sans-serif" font-size="14" fill="%239d9bb8" text-anchor="middle">No Image</text></svg>';

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
    return u.protocol === 'https:' && u.hostname === IMG_HOST ? u.href : FALLBACK_IMG;
  } catch { return FALLBACK_IMG; }
}

export function poster(title, url, eager = false) {
  const img = h('img', { 
    class: 'poster', 
    width: 225, 
    height: 318, 
    alt: `Poster anime ${title}`, 
    loading: eager ? 'eager' : 'lazy', 
    decoding: 'async',
    onerror: (e) => { e.target.src = FALLBACK_IMG; e.target.onerror = null; } // Fallback jika gambar gagal load
  });
  const src = url ? safeImageUrl(url) : FALLBACK_IMG;
  img.src = src;
  return img;
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2500);
}