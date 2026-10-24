// Klien Kitsu API: Timeout lebih cepat, paralel agar tidak menggantung
const BASE = 'https://kitsu.io/api/edge';
const TTL = 5 * 60 * 1000;
const TIMEOUT = 8000; // 8 detik batas waktu
const MAX_CACHE = 200;

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

const cache = new Map();
const inflight = new Map();

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
    if (!res.ok) throw new ApiError('data', `HTTP ${res.status}`);
    let json = await res.json();
    if (!json || !json.data) throw new ApiError('data', 'Empty response');
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('network', 'Request timeout');
    if (e instanceof ApiError) throw e;
    throw new ApiError('network', e?.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
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
    p = doFetch(url)
      .then(json => {
        cache.set(url, { json, exp: Date.now() + TTL });
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
        return json;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  return p; // Paralel langsung
}

// --- Endpoint Kitsu ---
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

export const animeFull = (id, signal) => get(`/anime/${id}`, { include: 'categories,episodes,streamingLinks' }, signal);

export const genres = async signal => {
  const res = await get('/categories', { 'page[limit]': 100 }, signal);
  return res.data || [];
};