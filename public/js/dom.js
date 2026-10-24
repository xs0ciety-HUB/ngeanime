const FALLBACK = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="%23161a2b"/><text x="150" y="225" font-family="sans-serif" font-size="16" fill="%239a98b0" text-anchor="middle">No Image</text></svg>';

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

export function poster(url, alt = 'Poster') {
  const img = h('img', { class: 'card-poster', src: url || FALLBACK, alt, loading: 'lazy', onerror: (e) => { e.target.src = FALLBACK; e.target.onerror = null; } });
  return img;
}