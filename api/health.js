'use strict';

/**
 * GET /api/health?token=<HEALTH_TOKEN>
 * Owner-only diagnostic: asks every configured upstream for /<source>/home and reports status, latency,
 * server header and a short body snippet. It names the upstream URLs, so it answers 404 unless HEALTH_TOKEN
 * is set in the environment and supplied (constant-time compare). Never publish the tokenised URL.
 */

const crypto = require('crypto');
const { bases, source, request, snippet } = require('./_upstream.js');

function tokenMatches(supplied) {
  const expected = process.env.HEALTH_TOKEN;
  if (!expected || typeof supplied !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const supplied = (req.query && req.query.token) || new URL(req.url || '/', 'http://localhost').searchParams.get('token');
  if (!tokenMatches(supplied)) return res.status(404).json({ ok: false });

  const list = bases();
  if (list.length === 0) return res.status(200).json({ ok: false, error: 'ANIME_API_BASE belum diatur', results: [] });

  const results = await Promise.all(
    list.map(async (base) => {
      const started = Date.now();
      try {
        const response = await request(`${base}/${source()}/home`);
        return {
          base,
          source: source(),
          status: response.status,
          ms: Date.now() - started,
          contentType: response.headers.get('content-type'),
          server: response.headers.get('server'),
          snippet: await snippet(response),
        };
      } catch (err) {
        return { base, source: source(), status: 0, ms: Date.now() - started, error: String((err && err.message) || err).slice(0, 160) };
      }
    }),
  );
  return res.status(200).json({ ok: results.some((r) => r.status === 200), checkedAt: new Date().toISOString(), results });
};
