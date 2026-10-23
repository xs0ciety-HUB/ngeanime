// Offline checks with mocked fetch/localStorage. Run: node scripts/check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let calls = 0, mode = 'ok';
globalThis.fetch = async (url, { signal } = {}) => {
  calls++;
  if (mode === '429') return { ok: false, status: 429 };
  if (mode === '500') return { ok: false, status: 503 };
  if (mode === 'bad') return { ok: true, status: 200, json: async () => { throw new Error('x'); } };
  if (mode === 'shape') return { ok: true, status: 200, json: async () => ({ nope: 1 }) };
  if (mode === 'net') throw new TypeError('offline');
  return { ok: true, status: 200, json: async () => ({ data: [{ mal_id: 1, url }] }) };
};
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };

const api = await import('../public/js/api.js');
const kind = async fn => { try { await fn(); return 'none'; } catch (e) { return e.kind; } };

assert.equal((await api.get('/anime', { q: 'a' })).data[0].mal_id, 1);
await api.get('/anime', { q: 'a' }); assert.equal(calls, 1, 'cache hit');
const [x, y] = await Promise.all([api.get('/x'), api.get('/x')]); assert.equal(calls, 2, 'in-flight dedupe');
for (const [m, k] of [['429', 'rate'], ['500', 'server'], ['bad', 'data'], ['shape', 'data'], ['net', 'network']]) {
  mode = m; assert.equal(await kind(() => api.get(`/e/${m}`)), k, m);
}
mode = 'ok';
const ac = new AbortController(); ac.abort();
assert.equal(await kind(() => api.get('/abort', {}, ac.signal)), 'aborted');

const s = await import('../public/js/store.js');
assert.deepEqual(s.readFavorites(), []);
assert.equal(s.toggleFavorite({ id: 5, title: 'A', image: null }).active, true);
assert.equal(s.isFavorite(5), true);
store.set('kakemono.favorites.v1', '[{"id":"x"},{"id":2,"title":"<img onerror=1>","image":null}]');
assert.equal(s.readFavorites().length, 1, 'invalid entries dropped');
store.set('kakemono.favorites.v1', '{broken'); assert.deepEqual(s.readFavorites(), []);
assert.equal(s.toggleFavorite({ id: 9, title: 'B', image: null }).active, true);

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
assert.ok(vercel.headers[0].headers.some(h => h.key === 'Content-Security-Policy'));
const re = new RegExp(`^${vercel.rewrites[0].source}$`);
assert.ok(re.test('/anime/123') && !re.test('/js/app.js') && !re.test('/css/style.css'));
console.log('all checks passed');
