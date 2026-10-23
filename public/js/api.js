// Klien Jikan v4: timeout, cache TTL, dedupe request sama, antrean serial (±2.5 req/s).
// Tidak auto-retry saat 429 supaya rate limit tidak makin parah.
const BASE = 'https://api.jikan.moe/v4';
const TTL = 5 * 60 * 1000;
const GAP = 400;
const TIMEOUT = 10000;
const MAX_CACHE = 200;

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const cache = new Map();
const inflight = new Map();
let chain = Promise.resolve();
let lastStart = 0;

function enqueue(task) {
  const run = chain.then(async () => {
    const wait = lastStart + GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastStart = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
}

async function doFetch(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) throw new ApiError('notfound', 'Not found');
    if (res.status === 429) throw new ApiError('rate', 'Rate limited');
    if (res.status >= 500) throw new ApiError('server', `HTTP ${res.status}`);
    if (!res.ok) throw new ApiError('data', `HTTP ${res.status}`);
    let json;
    try { json = await res.json(); } catch { throw new ApiError('data', 'Invalid JSON'); }
    if (!json || typeof json !== 'object' || !('data' in json)) throw new ApiError('data', 'Unexpected response shape');
    return json;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('network', e?.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

// Menunggu request bersama, tapi berhenti kalau pemanggil ini dibatalkan.
// Pembatalan pemanggil TIDAK membatalkan fetch-nya, jadi pemanggil lain tidak ikut gagal.
function awaitFor(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ApiError('aborted', 'aborted'));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ApiError('aborted', 'aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      v => { signal.removeEventListener('abort', onAbort); resolve(v); },
      e => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

export function get(path, params = {}, signal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) qs.set(k, String(v));
  const str = qs.toString();
  const url = `${BASE}${path}${str ? `?${str}` : ''}`;

  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.json);

  let p = inflight.get(url);
  if (!p) {
    p = enqueue(() => doFetch(url))
      .then(json => {
        cache.delete(url);
        cache.set(url, { json, exp: Date.now() + TTL });
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
        return json;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return awaitFor(p, signal);
}

const arr = x => (Array.isArray(x) ? x : []);
export const topAnime = signal => get('/top/anime', { filter: 'bypopularity', limit: 12, sfw: true }, signal);
export const seasonNow = signal => get('/seasons/now', { limit: 12, sfw: true }, signal);
export const searchAnime = (p, signal) => get('/anime', { limit: 24, sfw: true, ...p }, signal);
export const animeFull = (id, signal) => get(`/anime/${id}/full`, {}, signal);
export const recommendations = async (id, signal) => arr((await get(`/anime/${id}/recommendations`, {}, signal)).data);
export const streaming = async (id, signal) => arr((await get(`/anime/${id}/streaming`, {}, signal)).data);
export const genres = async signal => arr((await get('/genres/anime', {}, signal)).data);