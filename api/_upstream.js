'use strict';

/**
 * Shared upstream client. Files prefixed with "_" are not exposed as Vercel functions.
 *
 * Env:
 *   ANIME_API_BASE         required. One or more https base URLs, comma separated, tried in order.
 *                          Deliberately has no default: a URL in source code leaks with the repository.
 *   ANIME_SOURCE           scraper route on the upstream API, default "oploverz".
 *   UPSTREAM_BYPASS_SECRET optional. Sent as x-vercel-protection-bypass so the upstream project can sit behind
 *                          Vercel Deployment Protection and refuse everyone except this app.
 *
 * fetchWithFallback returns { response, failures }; response is null when every base failed
 * (403/429/5xx/timeout). failures is for server logs only and must never be returned to clients.
 */

const TIMEOUT_MS = 12000;
const RETRY_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bases() {
  return (process.env.ANIME_API_BASE || '')
    .split(',')
    .map((b) => b.trim().replace(/\/+$/, ''))
    .filter((b) => /^https:\/\//i.test(b));
}

/** Which scraper route on the upstream API to use: oploverz (default), otakudesu, kuramanime, ... */
function source() {
  return (process.env.ANIME_SOURCE || 'oploverz').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'oploverz';
}

/** Short human-readable reason from an upstream error body (JSON message/statusMessage, or stripped text). */
async function snippet(response) {
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      return String(json.message || json.statusMessage || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    } catch {
      return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    }
  } catch {
    return '';
  }
}

async function request(url) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'id,en;q=0.8' };
  if (process.env.UPSTREAM_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.UPSTREAM_BYPASS_SECRET;
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function fetchWithFallback(suffix) {
  const list = bases();
  const perBase = list.length > 1 ? 1 : 2;
  const failures = [];

  for (const base of list) {
    const host = new URL(base).host;
    for (let attempt = 0; attempt < perBase; attempt++) {
      if (attempt > 0) await sleep(350);
      try {
        const response = await request(`${base}${suffix}`);
        if (response.ok || !RETRY_STATUS.has(response.status)) return { response, failures };
        failures.push({ host, status: response.status, detail: await snippet(response) });
      } catch (err) {
        failures.push({ host, status: 0, detail: err && err.name === 'TimeoutError' ? 'timeout' : String((err && err.message) || err).slice(0, 120) });
      }
    }
  }
  return { response: null, failures };
}

module.exports = { bases, source, fetchWithFallback, request, snippet, USER_AGENT };
