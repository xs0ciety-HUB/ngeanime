const routes = [];
let ctl = null;
let fallback = () => {};

export const route = (pattern, handler) => routes.push({ re: new RegExp(`^(?:${pattern})$`), handler });
export const onNotFound = fn => { fallback = fn; };

export function resolve() {
  ctl?.abort();
  ctl = new AbortController();
  const { signal } = ctl;
  const url = new URL(location.href);
  for (const r of routes) {
    const m = url.pathname.match(r.re);
    if (m) return r.handler({ params: m.slice(1), query: url.searchParams, signal });
  }
  return fallback({ signal });
}

export function navigate(path, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  return resolve();
}

export function start() {
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[data-link]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const u = new URL(a.href);
    if (u.origin !== location.origin) return;
    e.preventDefault();
    navigate(u.pathname + u.search);
  });
  addEventListener('popstate', resolve);
  resolve();
}