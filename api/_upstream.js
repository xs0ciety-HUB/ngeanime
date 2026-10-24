'use strict';

/**
 * Shared upstream client. Files prefixed with "_" are not exposed as Vercel functions.
 *
 * ANIME_API_BASE accepts one or more base URLs separated by commas; they are tried in order.
 * Returns { response, failures }: response is null when every base failed (403/429/5xx/timeout),
 * and failures carries host, status and a 200-char body snippet per failed attempt for diagnosis.
 */

const DEFAULT_BASE = 'https://anime-api-red-pi.vercel.app';
const TIMEOUT_MS = 12000;
const RETRY_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function bases() {
  return (process.env.ANIME_API_BASE || DEFAULT_BASE)
    .split(',')
    .map((b) => b.trim().replace(/\/+$/, ''))
    .filter((b) => /^https:\/\//i.test(b));
}

async function snippet(response) {
  try {
    return (await response.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    return '';
  }
}

async function request(url) {
  return fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*', 'Accept-Language': 'id,en;q=0.8' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
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

module.exports = { bases, fetchWithFallback, request, snippet, USER_AGENT };
