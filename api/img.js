'use strict';

/**
 * GET /api/img?u=<https image url>
 *
 * Runtime: Vercel Node.js function (CommonJS, Node >= 18, global fetch).
 * Purpose: fetch poster images server-side with a same-site Referer so hotlink protection
 *          (403/404 when Referer is stripped) does not apply, and serve them from our origin
 *          (no mixed content, no third-party cookies, CDN-cacheable).
 * Guards : https only, no credentials/ports, no IP literals or internal hostnames,
 *          max 3 redirects each re-validated, 6 MB cap, raster formats only (magic-byte sniffed,
 *          so SVG/HTML can never be served from this origin).
 * Env    : IMG_HOST_ALLOW="cdn.example.com,example.org" replaces the default host allowlist (suffix match).
 *          Without it only the known poster CDNs below are fetched, so this is not an open image proxy.
 */

const { guard } = require('./_guard.js');

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const DEFAULT_ALLOW = 'wp.com,oploverz.am,otakudesu.cloud,otakudesu.best,otakudesu.cam,otakudesu.lol,otakudesu.blog,myanimelist.net';
const ALLOW = (process.env.IMG_HOST_ALLOW || DEFAULT_ALLOW)
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function parseTarget(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw.startsWith('//') ? `https:${raw}` : raw);
  } catch {
    return null;
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || (url.port && url.port !== '443')) return null;

  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host.includes(':') || /^\d+(\.\d+){3}$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|localdomain|home|lan|corp)$/.test(host)) return null;
  if (ALLOW.length && !ALLOW.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    console.warn('[img] host not in allowlist (set IMG_HOST_ALLOW to add it):', host);
    return null;
  }
  return url;
}

function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('latin1', 4, 8) === 'ftyp' && /avif|avis/.test(buf.toString('latin1', 8, 12))) return 'image/avif';
  return null;
}

async function readCapped(response) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BYTES) throw new Error('too-large');
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('too-large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchImage(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
        Referer: `${url.origin}/`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const next = parseTarget(new URL(response.headers.get('location'), url).href);
      if (!next) throw new Error('bad-redirect');
      url = next;
      continue;
    }
    return response;
  }
  throw new Error('too-many-redirects');
}

function fail(res, status, error) {
  res.setHeader('Cache-Control', status === 404 || status === 415 ? 'public, max-age=60' : 'no-store');
  return res.status(status).json({ ok: false, error });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return fail(res, 405, 'Method not allowed');
  }

  if (!guard(req, res, { bucket: 'img', limit: 600 })) return;

  const raw = req.query && req.query.u ? String(req.query.u) : new URL(req.url || '/', 'http://localhost').searchParams.get('u');
  const target = parseTarget(raw);
  if (!target) return fail(res, 400, 'URL gambar tidak valid');

  let upstream;
  try {
    upstream = await fetchImage(target);
  } catch (err) {
    console.error('[img] fetch failed:', target.href, err && err.message);
    return fail(res, 502, 'Gagal mengambil gambar');
  }

  if (!upstream.ok) {
    console.error('[img] upstream status', upstream.status, target.href);
    return fail(res, upstream.status === 404 ? 404 : 502, `Sumber gambar menolak (HTTP ${upstream.status})`);
  }

  let body;
  try {
    body = await readCapped(upstream);
  } catch (err) {
    return fail(res, 502, err.message === 'too-large' ? 'Gambar terlalu besar' : 'Gagal membaca gambar');
  }

  const type = sniff(body);
  if (!type) return fail(res, 415, 'Bukan file gambar yang didukung');

  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.statusCode = 200;
  return res.end(req.method === 'HEAD' ? undefined : body);
};
