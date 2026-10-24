'use strict';

/**
 * Request guard shared by every public /api function. Files prefixed with "_" are not exposed as routes.
 *
 * 1. Same-site only: a browser sends Sec-Fetch-Site (or Origin/Referer on older engines). Requests from
 *    other websites (hotlinking, third-party apps) and header-less clients (curl, naive scripts) get 403.
 *    A determined scraper can forge these headers, so this is a deterrent, not a vault.
 * 2. Per-IP rate limit, fixed window, kept in memory of the warm function instance. Serverless instances
 *    do not share memory, so enforce a hard limit with a Vercel Firewall rate-limit rule as well (see README).
 *
 * guard(req, res, { bucket, limit }) -> true when the request may proceed; otherwise the response is already sent.
 */

const WINDOW_MS = 60 * 1000;
const MAX_KEYS = 5000;
const counters = new Map();

function clientIp(req) {
  const h = req.headers || {};
  const forwarded = String(h['x-forwarded-for'] || '').split(',')[0].trim();
  return String(h['x-real-ip'] || forwarded || (req.socket && req.socket.remoteAddress) || 'unknown').trim();
}

function isSameSite(req) {
  const h = req.headers || {};
  const site = h['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none'; // "none" = address-bar navigation by a person
  const origin = h.origin || h.referer;
  if (!origin || !h.host) return false;
  try {
    return new URL(origin).host === h.host;
  } catch {
    return false;
  }
}

function overLimit(key, limit, now) {
  if (counters.size > MAX_KEYS) {
    for (const [k, v] of counters) if (v.reset <= now) counters.delete(k);
    if (counters.size > MAX_KEYS) counters.clear();
  }
  const entry = counters.get(key);
  if (!entry || entry.reset <= now) {
    counters.set(key, { count: 1, reset: now + WINDOW_MS });
    return 0;
  }
  entry.count += 1;
  return entry.count > limit ? Math.max(1, Math.ceil((entry.reset - now) / 1000)) : 0;
}

function guard(req, res, { bucket, limit }) {
  if (!isSameSite(req)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({ ok: false, error: 'Akses ditolak' });
    return false;
  }
  const retryAfter = overLimit(`${bucket}:${clientIp(req)}`, limit, Date.now());
  if (retryAfter) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ ok: false, error: 'Terlalu banyak permintaan, tunggu sebentar.' });
    return false;
  }
  return true;
}

module.exports = { guard, isSameSite, clientIp };
