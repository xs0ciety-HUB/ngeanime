const BASE = 'https://wajik-anime-api.vercel.app';
const TIMEOUT = 15000;

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new ApiError('data', `HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.statusCode !== 200) throw new ApiError('data', 'Invalid response');
    return json;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('network', e.message || 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

export const getHome = () => fetchJson(`${BASE}/otakudesu/home`);
export const getOngoing = (page = 1) => fetchJson(`${BASE}/otakudesu/ongoing?page=${page}`);
export const getCompleted = (page = 1) => fetchJson(`${BASE}/otakudesu/completed?page=${page}`);
export const searchAnime = (q) => fetchJson(`${BASE}/otakudesu/search?q=${encodeURIComponent(q)}`);
export const getGenres = () => fetchJson(`${BASE}/otakudesu/genre`);
export const getAnimeByGenre = (genreId, page = 1) => fetchJson(`${BASE}/otakudesu/genre/${genreId}?page=${page}`);
export const getAnimeDetail = (animeId) => fetchJson(`${BASE}/otakudesu/anime/${animeId}`);
export const getEpisodeDetail = (episodeId) => fetchJson(`${BASE}/otakudesu/episode/${episodeId}`);
export const getServerDetail = (serverId) => fetchJson(`${BASE}/otakudesu/server/${serverId}`);