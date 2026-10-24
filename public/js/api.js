const BASE_URL = '/api/otakudesu';
const IMG_ENDPOINT = '/api/img?u=';
const REQUEST_TIMEOUT = 30000;
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

const STATUS_MESSAGE = {
  400: 'Permintaan tidak valid.',
  404: 'Data tidak ditemukan.',
  429: 'Terlalu banyak permintaan, tunggu sebentar.',
  502: 'Server sumber sedang menolak atau down. Coba lagi beberapa saat.',
  503: 'Layanan sedang sibuk. Coba lagi beberapa saat.',
  504: 'Server sumber terlalu lama merespons.',
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestOnce(path, signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { signal: combined, headers: { Accept: 'application/json' } });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(err.name === 'TimeoutError' ? STATUS_MESSAGE[504] : 'Tidak ada koneksi ke server.', 0);
  }

  const type = (res.headers.get('content-type') || '').toLowerCase();
  let body = null;
  if (type.includes('application/json')) {
    try { body = await res.json(); } catch { body = null; }
  }

  if (!res.ok) {
    const detail = body && typeof body.error === 'string' ? body.error : null;
    const hint = res.status === 502 ? ' Diagnosis: buka /api/health.' : '';
    throw new ApiError(`${detail || STATUS_MESSAGE[res.status] || `Gagal memuat data (HTTP ${res.status}).`}${hint}`, res.status);
  }
  if (!body) throw new ApiError('Respons server bukan JSON. Pastikan folder /api ikut ter-deploy.', res.status);
  return body;
}

async function fetchJson(path, { signal } = {}) {
  try {
    return await requestOnce(path, signal);
  } catch (err) {
    const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
    if (!retryable || signal?.aborted) throw err;
    await new Promise((r) => setTimeout(r, 600));
    return requestOnce(path, signal);
  }
}

function getCached(key) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL ? hit.data : null;
}
function setCached(key, data) {
  cache.set(key, { at: Date.now(), data });
}

export function safeHttpsUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

/** Raw poster URL -> same-origin proxied URL. Idempotent, so old localStorage entries keep working. */
export function imageSrc(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.startsWith(IMG_ENDPOINT)) return raw;
  const safe = safeHttpsUrl(raw);
  return safe ? `${IMG_ENDPOINT}${encodeURIComponent(safe)}` : null;
}

export function sanitizeText(s, max = 500) {
  if (typeof s === 'number') s = String(s);
  if (typeof s !== 'string') return '';
  return s.replace(/\u0000/g, '').slice(0, max).trim();
}

function pickList(value, ...keys) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const k of keys) if (Array.isArray(value[k])) return value[k];
  }
  return [];
}

function normAnime(raw) {
  if (!raw || !raw.title || !raw.animeId) return null;
  return {
    title: sanitizeText(raw.title, 200),
    animeId: sanitizeText(raw.animeId, 200),
    poster: safeHttpsUrl(raw.poster),
    status: sanitizeText(raw.status, 60) || null,
  };
}
function normList(list) { return Array.isArray(list) ? list.map(normAnime).filter(Boolean) : []; }

function assertOk(json, message) {
  const code = json?.statusCode ?? 200;
  if (code !== 200 || !json?.data) throw new ApiError(message, code);
}

function normServers(server) {
  const flat = [];
  const push = (s, quality) => {
    const serverId = sanitizeText(s?.serverId, 300);
    if (!serverId) return;
    const name = sanitizeText(s.title, 60) || 'Server';
    flat.push({ serverId, title: quality ? `${name} ${quality}` : name });
  };
  if (Array.isArray(server)) server.forEach((s) => push(s, ''));
  else if (server && Array.isArray(server.qualities)) {
    server.qualities.forEach((q) => pickList(q.serverList).forEach((s) => push(s, sanitizeText(q.title, 20))));
  }
  return flat;
}

function normEpisodeRef(ref) {
  const episodeId = sanitizeText(ref?.episodeId, 200);
  return episodeId ? { episodeId } : null;
}

export async function getHome({ signal } = {}) {
  const hit = getCached('home');
  if (hit) return hit;
  const json = await fetchJson('/home', { signal });
  assertOk(json, 'Beranda tidak tersedia');
  const { ongoing, complete, completed } = json.data;
  const res = {
    ongoing: normList(pickList(ongoing, 'animeList')),
    complete: normList(pickList(complete ?? completed, 'animeList')),
  };
  if (res.ongoing.length || res.complete.length) setCached('home', res);
  return res;
}

export async function searchAnime(q, { signal } = {}) {
  q = sanitizeText(q, 60);
  if (!q) return { animeList: [] };
  const hit = getCached(`s:${q}`);
  if (hit) return hit;
  const json = await fetchJson(`/search?q=${encodeURIComponent(q)}`, { signal });
  assertOk(json, 'Gagal mencari');
  const res = { animeList: normList(pickList(json.data.animeList)) };
  setCached(`s:${q}`, res);
  return res;
}

export async function getAnimeDetail(id, { signal } = {}) {
  const hit = getCached(`a:${id}`);
  if (hit) return hit;
  const json = await fetchJson(`/anime/${encodeURIComponent(id)}`, { signal });
  assertOk(json, 'Detail tidak tersedia');
  const d = json.data;
  const synopsis = typeof d.synopsis === 'string' ? d.synopsis : pickList(d.synopsis, 'paragraphs').join('\n\n');
  const res = {
    title: sanitizeText(d.title, 200),
    poster: safeHttpsUrl(d.poster),
    synopsis: sanitizeText(synopsis, 4000),
    info: {
      status: sanitizeText(d.info?.status ?? d.status, 60),
      skor: sanitizeText(d.info?.skor ?? d.score, 20),
    },
    episodeList: pickList(d.episodeList)
      .map((e, i) => ({
        episodeId: sanitizeText(e?.episodeId, 200),
        title: sanitizeText(e?.title, 200) || `Eps ${i + 1}`,
      }))
      .filter((e) => e.episodeId),
  };
  setCached(`a:${id}`, res);
  return res;
}

export async function getEpisode(id, { signal } = {}) {
  const json = await fetchJson(`/episode/${encodeURIComponent(id)}`, { signal });
  assertOk(json, 'Episode tidak tersedia');
  const d = json.data;
  return {
    title: sanitizeText(d.title, 200),
    animeId: sanitizeText(d.animeId, 200),
    defaultStreamingUrl: safeHttpsUrl(d.defaultStreamingUrl),
    prevEpisode: normEpisodeRef(d.prevEpisode),
    nextEpisode: normEpisodeRef(d.nextEpisode),
    server: normServers(d.server),
  };
}

export async function getServerUrl(serverId, { signal } = {}) {
  const json = await fetchJson(`/server/${encodeURIComponent(serverId)}`, { signal });
  assertOk(json, 'Server tidak tersedia');
  const url = safeHttpsUrl(json.data.url);
  if (!url) throw new ApiError('Server tidak mengembalikan URL video.', 502);
  return url;
}
