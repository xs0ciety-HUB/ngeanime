const BASE = '/api/anime';
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function fetchJson(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  const now = Date.now();
  if (cache.has(url) && now - cache.get(url).ts < CACHE_TTL) {
    return cache.get(url).data;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new ApiError('http', `HTTP ${res.status}`);
    const json = await res.json();
    if (json.statusCode && json.statusCode !== 200) throw new ApiError('api', json.message || 'API Error');
    cache.set(url, { data: json, ts: now });
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new ApiError('timeout', 'Request timeout');
    if (e instanceof ApiError) throw e;
    throw new ApiError('network', e.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCard(a) {
  return {
    id: a.animeId || a.id || a.slug,
    title: a.title || a.judul || 'Tanpa judul',
    poster: a.poster || a.cover || null,
    episodes: a.episodes || a.total_episode || null,
    releaseDay: a.releaseDay || a.release_on_every || null,
    score: a.score || a.rating || null,
    status: a.status || null,
  };
}

export async function getHome() {
  const res = await fetchJson('/home');
  const ongoing = (res.data?.ongoing?.animeList || []).map(normalizeCard);
  const completed = (res.data?.completed?.animeList || []).map(normalizeCard);
  return { ongoing, completed };
}

export async function searchAnime(q) {
  const res = await fetchJson('/search', { q });
  return (res.data?.animeList || []).map(normalizeCard);
}

export async function getAnimeDetail(animeId) {
  const res = await fetchJson(`/anime/${encodeURIComponent(animeId)}`);
  const d = res.data || {};
  return {
    id: d.animeId || animeId,
    title: d.title || 'Tanpa judul',
    poster: d.poster || null,
    synopsis: d.synopsis || 'Sinopsis belum tersedia.',
    genres: (d.genreList || []).map(g => g.name || g),
    status: d.status || '-',
    score: d.score || '-',
    episodes: d.episodeList || [],
  };
}

export async function getEpisodeDetail(episodeId) {
  const res = await fetchJson(`/episode/${encodeURIComponent(episodeId)}`);
  const d = res.data || {};
  return {
    title: d.title || 'Episode',
    serverList: d.server || [],
    hasPrev: d.hasPrevEpisode || false,
    hasNext: d.hasNextEpisode || false,
    prev: d.prevEpisode || null,
    next: d.nextEpisode || null,
  };
}

export async function getServerUrl(serverId) {
  const res = await fetchJson(`/server/${encodeURIComponent(serverId)}`);
  return res.data?.url || null;
}