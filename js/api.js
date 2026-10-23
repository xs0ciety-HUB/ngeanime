// Jikan v4 client: timeout, abort, TTL cache, in-flight dedupe, serial queue (~2.5 req/s), no auto-retry on 429.
const BASE = 'https://api.jikan.moe/v4';
const TTL = 5 * 60 * 1000;
const GAP = 400;
const TIMEOUT = 10000;

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; } // network | rate | server | data | notfound | aborted
}

const cache = new Map();
const inflight = new Map();
let chain = Promise.resolve();
let lastStart = 0;

function queued(task, signal) {
  const run = chain.then(async () => {
    if (signal?.aborted) throw new ApiError('aborted', 'aborted');
    const wait = lastStart + GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (signal?.aborted) throw new ApiError('aborted', 'aborted');
    lastStart = Date.now();
    return task();
  });
  chain = run.catch(() => {});
  return run;
}

async function doFetch(url, signal) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
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
    if (signal?.aborted) throw new ApiError('aborted', 'aborted');
    throw new ApiError('network', e?.message || 'Network error');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function get(path, params = {}, signal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) qs.set(k, String(v));
  const str = qs.toString();
  const url = `${BASE}${path}${str ? `?${str}` : ''}`;
  const hit = cache.get(url);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.json);
  if (inflight.has(url)) return inflight.get(url);
  const p = queued(() => doFetch(url, signal), signal)
    .then(json => { cache.set(url, { json, exp: Date.now() + TTL }); return json; })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

const arr = x => (Array.isArray(x) ? x : []);
export const topAnime = signal => get('/top/anime', { filter: 'bypopularity', limit: 12, sfw: true }, signal);
export const seasonNow = signal => get('/seasons/now', { limit: 12, sfw: true }, signal);
export const searchAnime = (p, signal) => get('/anime', { limit: 24, sfw: true, ...p }, signal);
export const animeFull = (id, signal) => get(`/anime/${id}/full`, {}, signal);
export const recommendations = async (id, signal) => arr((await get(`/anime/${id}/recommendations`, {}, signal)).data);
export const genres = async signal => arr((await get('/genres/anime', {}, signal)).data);
