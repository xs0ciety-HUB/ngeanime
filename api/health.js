'use strict';

/**
 * GET /api/health
 * Diagnostic: asks every configured upstream for /otakudesu/home and reports status, latency,
 * content-type and a 200-char body snippet. Open it in the browser when the homepage fails
 * to see whether the 403 comes from the upstream API, its own Cloudflare layer, or a network fault.
 */

const { bases, request, snippet } = require('./_upstream.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const results = await Promise.all(
    bases().map(async (base) => {
      const started = Date.now();
      try {
        const response = await request(`${base}/otakudesu/home`);
        return {
          base,
          status: response.status,
          ms: Date.now() - started,
          contentType: response.headers.get('content-type'),
          server: response.headers.get('server'),
          snippet: await snippet(response),
        };
      } catch (err) {
        return { base, status: 0, ms: Date.now() - started, error: String((err && err.message) || err).slice(0, 160) };
      }
    }),
  );
  return res.status(200).json({ ok: results.some((r) => r.status === 200), checkedAt: new Date().toISOString(), results });
};
