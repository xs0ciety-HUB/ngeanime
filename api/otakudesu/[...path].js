'use strict';

/**
 * GET /api/otakudesu/*  →  ${ANIME_API_BASE}/otakudesu/*
 *
 * Runtime: Vercel Node.js function (CommonJS, Node >= 18, global fetch).
 * Inputs : home | search?q= | anime/:id | episode/:id | server/:id
 * Output : upstream JSON verbatim on 200; { ok:false, error, upstreamStatus } otherwise.
 * Errors : 400 invalid path, 404 upstream 404, 502 upstream 403/429/5xx/timeout/non-JSON.
 * Cache  : successful responses only (CDN s-maxage); errors are never cached.
 */

const UPSTREAM = (process.env.ANIME_API_BASE || 'https://wajik-anime-api.vercel.app').replace(/\/+$/, '');
const TIMEOUT_MS = 12000;
const ATTEMPTS = 2;
const RETRY_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// route -> number of :id segments required after it
const ROUTES = new Map([
  ['home', 0],
  ['search', 0],
  ['anime', 1],
  ['episode', 1],
  ['server', 1],
]);
const CDN_TTL = { home: 300, search: 300, anime: 600, episode: 300, server: 60 };
const SEGMENT_OK = /^[^\/\\\u0000-\u001f\u007f]{1,300}$/;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readSegments(req) {
  const fromQuery = req.query && req.query.path;
  if (Array.isArray(fromQuery)) return fromQuery.map(String);
  if (typeof fromQuery === 'string') return fromQuery.split('/');

  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  return pathname
    .replace(/^\/api\/otakudesu\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return '';
      }
    });
}

function buildTarget(req) {
  const segments = readSegments(req).filter((s) => s !== '');
  const route = segments[0];
  if (!ROUTES.has(route)) return null;
  if (segments.length !== 1 + ROUTES.get(route)) return null;
  if (!segments.every((s) => SEGMENT_OK.test(s) && s !== '.' && s !== '..')) return null;

  let target = `${UPSTREAM}/otakudesu/${segments.map(encodeURIComponent).join('/')}`;
  if (route === 'search') {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = (url.searchParams.get('q') || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
    if (!q) return null;
    target += `?q=${encodeURIComponent(q)}`;
  }
  return { route, target };
}

async function fetchUpstream(target) {
  let last = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(350 * attempt);
    try {
      const response = await fetch(target, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'id,en;q=0.8' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!RETRY_STATUS.has(response.status)) return response;
      last = response;
    } catch (err) {
      last = err;
    }
  }
  if (last instanceof Response) return last;
  throw last;
}

function fail(res, status, error, upstreamStatus) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error, upstreamStatus: upstreamStatus ?? null });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return fail(res, 405, 'Method not allowed');
  }

  const built = buildTarget(req);
  if (!built) return fail(res, 400, 'Path tidak valid');

  let upstream;
  try {
    upstream = await fetchUpstream(built.target);
  } catch (err) {
    console.error('[otakudesu] upstream unreachable:', built.target, err && err.name, err && err.message);
    return fail(res, 502, 'Server sumber tidak merespons, coba lagi sebentar lagi');
  }

  if (!upstream.ok) {
    console.error('[otakudesu] upstream status', upstream.status, built.target);
    if (upstream.status === 404) return fail(res, 404, 'Data tidak ditemukan di sumber', 404);
    return fail(res, 502, `Sumber menolak permintaan (HTTP ${upstream.status})`, upstream.status);
  }

  let payload;
  try {
    payload = JSON.parse(await upstream.text());
  } catch {
    return fail(res, 502, 'Respons sumber bukan JSON', upstream.status);
  }

  const ttl = CDN_TTL[built.route];
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${ttl}, stale-while-revalidate=3600`);
  return res.status(200).json(payload);
};
