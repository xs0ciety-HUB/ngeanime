// KITA GUNAKAN PROXY PUBLIK (ALLORIGINS) UNTUK BYPASS CLOUDFLARE
const PROXY_URL = 'https://api.allorigins.win/raw?url=';
const BASE_URL = 'https://wajik-anime-api.vercel.app/otakudesu';
const DEFAULT_TIMEOUT = 15000;
const CACHE_TTL = 5 * 60 * 1000;
const MAX_QUERY_LEN = 60;
const cache = new Map();

function withTimeout(signal, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    timeout
  );
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  return { signal: combined, cleanup: () => clearTimeout(timer) };
}

async function fetchJson(path, { timeout = DEFAULT_TIMEOUT, signal } = {}) {
  const { signal: s, cleanup } = withTimeout(signal, timeout);
  try {
    // Encode URL asli sebelum dimasukkan ke proxy
    const targetUrl = `${BASE_URL}${path}`;
    const proxyUrl = `${PROXY_URL}${encodeURIComponent(targetUrl)}`;

    const res = await fetch(proxyUrl, {
      signal: s,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) throw new Error('Respons bukan JSON');
    return await res.json();
  } finally {
    cleanup();
  }
}

function getCached(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) { cache.delete(key); return null; }
  return hit.data;
}

function setCached(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 100) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

export function safeHttpsUrl(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

export function sanitizeText(s, max = 500) {
  if (typeof s !== 'string') return '';
  return s.replace(/\u0000/g, '').slice(0, max).trim();
}

function normalizeAnimeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = sanitizeText(raw.title, 200);
  const animeId = sanitizeText(raw.animeId, 200);
  if (!title || !animeId) return null;
  return {
    title,
    animeId,
    poster: safeHttpsUrl(raw.poster),
    status: sanitizeText(raw.status, 60) || null,
    score: sanitizeText(raw.score, 20) || null,
    genreList: Array.isArray(raw.genreList)
      ? raw.genreList
          .map((g) => (g && typeof g.title === 'string' ? sanitizeText(g.title, 60) : null))
          .filter(Boolean)
      : [],
  };
}

function normalizeAnimeList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeAnimeItem).filter(Boolean);
}

function normalizeEpisodeList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((ep, i) => {
      if (!ep || typeof ep !== 'object') return null;
      const episodeId = sanitizeText(ep.episodeId, 200);
      if (!episodeId) return null;
      return {
        episodeId,
        title: sanitizeText(ep.title, 200) || `Episode ${i + 1}`,
        index: i + 1,
      };
    })
    .filter(Boolean);
}

function normalizePagination(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    currentPage: Number(p.currentPage) || 1,
    totalPages: Number(p.totalPages) || 1,
    hasPrev: Boolean(p.prevPage),
    hasNext: Boolean(p.nextPage),
  };
}

export async function searchAnime(query, { signal } = {}) {
  const q = sanitizeText(query, MAX_QUERY_LEN);
  if (!q) return { animeList: [], pagination: null };
  const key = `search:${q}`;
  const cached = getCached(key);
  if (cached) return cached;
  
  // Perhatikan path-nya sekarang tidak perlu '/otakudesu' lagi karena sudah ada di BASE_URL
  const json = await fetchJson(`/search?q=${encodeURIComponent(q)}`, { signal });
  if (json.statusCode !== 200 || !json.data) {
    throw new Error(json.message || 'Pencarian gagal');
  }
  const result = {
    animeList: normalizeAnimeList(json.data.animeList || []),
    pagination: normalizePagination(json.pagination),
  };
  setCached(key, result);
  return result;
}

export async function getHome({ signal } = {}) {
  const key = 'home';
  const cached = getCached(key);
  if (cached) return cached;
  const json = await fetchJson('/home', { signal });
  if (json.statusCode !== 200 || !json.data) {
    throw new Error(json.message || 'Beranda tidak tersedia');
  }
  const result = {
    ongoing: normalizeAnimeList(json.data.ongoing || []),
    complete: normalizeAnimeList(json.data.complete || []),
  };
  setCached(key, result);
  return result;
}

export async function getAnimeDetail(animeId, { signal } = {}) {
  const id = sanitizeText(animeId, 200);
  if (!id) throw new Error('ID anime tidak valid');
  const key = `anime:${id}`;
  const cached = getCached(key);
  if (cached) return cached;
  const json = await fetchJson(`/anime/${encodeURIComponent(id)}`, { signal });
  if (json.statusCode !== 200 || !json.data) {
    throw new Error(json.message || 'Detail anime tidak tersedia');
  }
  const d = json.data;
  const info = d.info || {};
  const result = {
    title: sanitizeText(d.title || info.judul, 200),
    poster: safeHttpsUrl(d.poster),
    synopsis: sanitizeText(d.synopsis, 4000),
    info: {
      judul: sanitizeText(info.judul, 200),
      japanese: sanitizeText(info.japanese, 200),
      skor: sanitizeText(info.skor, 20),
      produser: sanitizeText(info.produser, 200),
      tipe: sanitizeText(info.tipe, 50),
      status: sanitizeText(info.status, 60),
      totalEpisode: sanitizeText(info.total_episode, 20),
      durasi: sanitizeText(info.durasi, 50),
      tanggalRilis: sanitizeText(info.tanggal_rilis, 60),
      studio: sanitizeText(info.studio, 100),
      genre: Array.isArray(info.genre)
        ? info.genre.map((g) => sanitizeText(g?.name || g?.title, 60)).filter(Boolean)
        : [],
    },
    episodeList: normalizeEpisodeList(d.episodeList),
  };
  setCached(key, result);
  return result;
}

export async function getEpisode(episodeId, { signal } = {}) {
  const id = sanitizeText(episodeId, 200);
  if (!id) throw new Error('ID episode tidak valid');
  const json = await fetchJson(`/episode/${encodeURIComponent(id)}`, { signal });
  if (json.statusCode !== 200 || !json.data) {
    throw new Error(json.message || 'Episode tidak tersedia');
  }
  const d = json.data;
  return {
    title: sanitizeText(d.title, 200),
    animeId: sanitizeText(d.animeId, 200),
    defaultStreamingUrl: safeHttpsUrl(d.defaultStreamingUrl),
    prevEpisode: d.prevEpisode
      ? {
          episodeId: sanitizeText(d.prevEpisode.episodeId, 200),
          title: sanitizeText(d.prevEpisode.title, 200),
        }
      : null,
    nextEpisode: d.nextEpisode
      ? {
          episodeId: sanitizeText(d.nextEpisode.episodeId, 200),
          title: sanitizeText(d.nextEpisode.title, 200),
        }
      : null,
    server: Array.isArray(d.server)
      ? d.server
          .map((s) => ({
            serverId: sanitizeText(s?.serverId, 200),
            title: sanitizeText(s?.title, 100),
          }))
          .filter((s) => s.serverId)
      : [],
    episodeList: normalizeEpisodeList(d.episodeList),
  };
}

export async function getServerUrl(serverId, { signal } = {}) {
  const id = sanitizeText(serverId, 200);
  if (!id) throw new Error('ID server tidak valid');
  const json = await fetchJson(`/server/${encodeURIComponent(id)}`, { signal });
  if (json.statusCode !== 200 || !json.data || typeof json.data.url !== 'string') {
    throw new Error('URL server tidak tersedia');
  }
  const url = safeHttpsUrl(json.data.url);
  if (!url) throw new Error('URL server tidak valid');
  return url;
}