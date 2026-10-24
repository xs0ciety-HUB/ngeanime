// Klien Kitsu API (JSON:API): timeout, cache TTL, dedupe, dan antrean serial.
const BASE = 'https://kitsu.io/api/edge';
const TTL = 5 * 60 * 1000;
const GAP = 300; // Kitsu lebih longgar dari Jikan
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
    const res = await fetch(url, { 
      signal: ctl.signal, 
      headers: { 
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json'
      } 
    });
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

// --- Endpoint Khusus Kitsu ---
export const topAnime = signal => get('/anime', { 'sort': 'popularityRank', 'page[limit]': 12 }, signal);
export const seasonNow = signal => get('/anime', { 'filter[status]': 'current', 'sort': 'popularityRank', 'page[limit]': 12 }, signal);

export const searchAnime = (p, signal) => {
  const params = {
    'page[limit]': 24,
    'page[offset]': (p.page - 1) * 24,
  };
  if (p.q) params['filter[text]'] = p.q;
  if (p.genre) params['filter[categories]'] = p.genre;
  if (p.type) params['filter[subtype]'] = p.type;
  if (p.status) params['filter[status]'] = p.status === 'airing' ? 'current' : p.status === 'complete' ? 'finished' : 'upcoming';
  
  if (!p.q) params['sort'] = 'popularityRank';
  
  return get('/anime', params, signal);
};

// Detail anime beserta relasi (kategori, episode, tautan streaming)
export const animeFull = (id, signal) => get(`/anime/${id}`, { include: 'categories,episodes,streamingLinks' }, signal);

export const genres = async signal => {
  const res = await get('/categories', { 'page[limit]': 100 }, signal);
  return res.data || [];
};