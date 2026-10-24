const routes = [];
let currentCleanup = null;

export function route(pattern, handler) {
  routes.push({ re: new RegExp(`^(?:${pattern})$`), handler });
}

export function navigate(path) {
  history.pushState(null, '', path);
  resolve();
}

export function resolve() {
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  const path = location.pathname;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      const result = r.handler({ params: m.slice(1) });
      if (typeof result === 'function') currentCleanup = result;
      return;
    }
  }
  document.getElementById('app').innerHTML = '<div class="state"><h1>404</h1><p>Halaman tidak ditemukan.</p><a href="/" data-link class="btn btn-primary">Kembali</a></div>';
}

export function start() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  window.addEventListener('popstate', resolve);
  resolve();
}