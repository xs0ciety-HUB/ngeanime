'use strict';

/**
 * GET /api/otakudesu/*  →  <ANIME_API_BASE>/otakudesu/*   (see ../_upstream.js)
 *
 * Runtime: Vercel Node.js function (CommonJS, Node >= 18, global fetch).
 * Inputs : home | search?q= | anime/:id | episode/:id | server/:id
 * Output : upstream JSON verbatim on 200; { ok:false, error, upstreamStatus, detail, tried } otherwise.
 * Errors : 400 invalid path, 404 upstream 404, 502 every upstream failed (403/429/5xx/timeout/non-JSON).
 * Cache  : successful responses only (CDN s-maxage); errors are never cached.
 */

const { fetchWithFallback, source } = require('../_upstream.js');

// route -> number of :id segments required after it
const ROUTES = new Map([
  ['home', 0],
  ['search', 0],
  ['anime', 1],
  ['episode', 1],
  ['server', 1],
]);
const CDN_TTL = { home: 300, search: 300, anime: 600, episode: 300, server: 60 };
// Last good payload per path, per warm instance: served (marked stale) when every upstream fails.
const LAST_GOOD = new Map();
const LAST_GOOD_MAX = 200;
const LAST_GOOD_TTL_MS = 6 * 60 * 60 * 1000;
const SEGMENT_OK = /^[^\/\\\u0000-\u001f\u007f]{1,300}$/;

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

function buildSuffix(req) {
  const segments = readSegments(req).filter((s) => s !== '');
  const route = segments[0];
  if (!ROUTES.has(route)) return null;
  if (segments.length !== 1 + ROUTES.get(route)) return null;
  if (!segments.every((s) => SEGMENT_OK.test(s) && s !== '.' && s !== '..')) return null;

  let suffix = `/${source()}/${segments.map(encodeURIComponent).join('/')}`;
  if (route === 'search') {
    const url = new URL(req.url || '/', 'http://localhost');
    const q = (url.searchParams.get('q') || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 60);
    if (!q) return null;
    suffix += `?q=${encodeURIComponent(q)}`;
  }
  return { route, suffix };
}

function fail(res, status, error, extra = {}) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error, upstreamStatus: null, ...extra });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return fail(res, 405, 'Method not allowed');
  }

  const built = buildSuffix(req);
  if (!built) return fail(res, 400, 'Path tidak valid');

  const { response: upstream, failures } = await fetchWithFallback(built.suffix);

  if (!upstream) {
    const last = failures[failures.length - 1] || {};
    console.error('[otakudesu] all upstreams failed', built.suffix, JSON.stringify(failures));
    const stale = LAST_GOOD.get(built.suffix);
    if (stale && Date.now() - stale.at < LAST_GOOD_TTL_MS) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Stale', '1');
      return res.status(200).json(stale.payload);
    }
    const reason = last.status ? `Sumber menolak permintaan (HTTP ${last.status})` : 'Server sumber tidak merespons, coba lagi sebentar lagi';
    return fail(res, 502, reason, { upstreamStatus: last.status || null, detail: last.detail || '', tried: failures });
  }

  if (!upstream.ok) {
    if (upstream.status === 404) return fail(res, 404, 'Data tidak ditemukan di sumber', { upstreamStatus: 404 });
    return fail(res, 502, `Sumber menolak permintaan (HTTP ${upstream.status})`, { upstreamStatus: upstream.status });
  }

  let payload;
  try {
    payload = JSON.parse(await upstream.text());
  } catch {
    return fail(res, 502, 'Respons sumber bukan JSON', { upstreamStatus: upstream.status });
  }

  if (LAST_GOOD.size >= LAST_GOOD_MAX) LAST_GOOD.delete(LAST_GOOD.keys().next().value);
  LAST_GOOD.set(built.suffix, { at: Date.now(), payload });
  res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${CDN_TTL[built.route]}, stale-while-revalidate=3600`);
  return res.status(200).json(payload);
};
