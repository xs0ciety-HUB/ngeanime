const BASE_URL = 'https://wajik-anime-api.vercel.app/otakudesu';
const PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`
];
const DEFAULT_TIMEOUT = 25000;
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

async function fetchJson(path, { signal } = {}) {
  const targetUrl = `${BASE_URL}${path}`;
  let lastError = null;

  for (const proxy of PROXIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;

    try {
      const res = await fetch(proxy(targetUrl), { signal: combinedSignal, headers: { Accept: 'application/json' } });
      clearTimeout(timer);
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) throw new Error('Bukan JSON');
      
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (err.name === 'AbortError') throw err;
    }
  }
  throw lastError || new Error('Semua proxy gagal');
}

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  return null;
}
function setCached(key, data) {
  cache.set(key, { at: Date.now(), data });
}

export function safeHttpsUrl(raw) {
  if (typeof raw !== 'string') return null;
  try { const u = new URL(raw); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
export function sanitizeText(s, max = 500) {
  if (typeof s !== 'string') return '';
  return s.replace(/\u0000/g, '').slice(0, max).trim();
}

function normAnime(raw) {
  if (!raw || !raw.title || !raw.animeId) return null;
  return { title: sanitizeText(raw.title, 200), animeId: sanitizeText(raw.animeId, 200), poster: safeHttpsUrl(raw.poster), status: sanitizeText(raw.status, 60) || null };
}
function normList(list) { return Array.isArray(list) ? list.map(normAnime).filter(Boolean) : []; }

export async function getHome({ signal } = {}) {
  if (getCached('home')) return getCached('home');
  const json = await fetchJson('/home', { signal });
  if (json.statusCode !== 200 || !json.data) throw new Error('Beranda tidak tersedia');
  const res = { ongoing: normList(json.data.ongoing), complete: normList(json.data.complete) };
  setCached('home', res);
  return res;
}

export async function searchAnime(q, { signal } = {}) {
  q = sanitizeText(q, 60);
  if (!q) return { animeList: [] };
  if (getCached(`s:${q}`)) return getCached(`s:${q}`);
  const json = await fetchJson(`/search?q=${encodeURIComponent(q)}`, { signal });
  if (json.statusCode !== 200 || !json.data) throw new Error('Gagal mencari');
  const res = { animeList: normList(json.data.animeList) };
  setCached(`s:${q}`, res);
  return res;
}

export async function getAnimeDetail(id, { signal } = {}) {
  if (getCached(`a:${id}`)) return getCached(`a:${id}`);
  const json = await fetchJson(`/anime/${encodeURIComponent(id)}`, { signal });
  if (json.statusCode !== 200 || !json.data) throw new Error('Detail tidak tersedia');
  const d = json.data;
  const res = {
    title: sanitizeText(d.title, 200),
    poster: safeHttpsUrl(d.poster),
    synopsis: sanitizeText(d.synopsis, 4000),
    info: { status: sanitizeText(d.info?.status, 60), skor: sanitizeText(d.info?.skor, 20) },
    episodeList: Array.isArray(d.episodeList) ? d.episodeList.map((e, i) => ({ episodeId: sanitizeText(e.episodeId, 200), title: sanitizeText(e.title, 200) || `Eps ${i+1}` })).filter(e => e.episodeId) : []
  };
  setCached(`a:${id}`, res);
  return res;
}

export async function getEpisode(id, { signal } = {}) {
  const json = await fetchJson(`/episode/${encodeURIComponent(id)}`, { signal });
  if (json.statusCode !== 200 || !json.data) throw new Error('Episode tidak tersedia');
  const d = json.data;
  return {
    title: sanitizeText(d.title, 200),
    animeId: sanitizeText(d.animeId, 200),
    defaultStreamingUrl: safeHttpsUrl(d.defaultStreamingUrl),
    prevEpisode: d.prevEpisode ? { episodeId: sanitizeText(d.prevEpisode.episodeId, 200) } : null,
    nextEpisode: d.nextEpisode ? { episodeId: sanitizeText(d.nextEpisode.episodeId, 200) } : null,
    server: Array.isArray(d.server) ? d.server.map(s => ({ serverId: sanitizeText(s.serverId, 200), title: sanitizeText(s.title, 100) })).filter(s => s.serverId) : []
  };
}

export async function getServerUrl(serverId, { signal } = {}) {
  const json = await fetchJson(`/server/${encodeURIComponent(serverId)}`, { signal });
  if (json.statusCode !== 200 || !json.data || !json.data.url) throw new Error('Server tidak tersedia');
  return safeHttpsUrl(json.data.url);
}