const routes = [];
let currentCleanup = null;
let currentController = null;
let notFoundHandler = null;

export function register(pattern, handler) {
  routes.push({ pattern: parsePattern(pattern), handler });
}
export function setNotFound(handler) { notFoundHandler = handler; }

function parsePattern(pattern) {
  return pattern.split('/').filter(Boolean).map((seg) => (seg.startsWith(':') ? { param: seg.slice(1) } : { literal: seg }));
}
function matchPattern(segs, pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (segs.length !== parts.length) return null;
  const params = {};
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].param) params[segs[i].param] = decodeURIComponent(parts[i]);
    else if (segs[i].literal !== parts[i]) return null;
  }
  return params;
}

export function navigate(href, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', href);
  else history.pushState({}, '', href);
  render();
}

export async function render() {
  const pathname = location.pathname;
  const search = new URLSearchParams(location.search);
  if (currentCleanup) { try { currentCleanup(); } catch {} currentCleanup = null; }

  // Each navigation aborts the previous one, so a slow response can never paint into a newer page.
  if (currentController) currentController.abort();
  currentController = new AbortController();
  const { signal } = currentController;

  for (const route of routes) {
    const params = matchPattern(route.pattern, pathname);
    if (params) {
      const result = await route.handler({ params, search, pathname, signal });
      if (typeof result === 'function') currentCleanup = result;
      return;
    }
  }
  if (notFoundHandler) await notFoundHandler({ pathname, signal });
}

export function start() {
  window.addEventListener('popstate', render);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    if (url.pathname + url.search === location.pathname + location.search) return;
    navigate(url.pathname + url.search);
  });
  render();
}