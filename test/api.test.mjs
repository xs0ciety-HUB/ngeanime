import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsonProxy = require('../api/otakudesu/[...path].js');
const imgProxy = require('../api/img.js');
const health = require('../api/health.js');

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    end(b) { this.body = b; return this; },
  };
}
const call = async (handler, url, query = {}) => {
  const res = mockRes();
  await handler({ method: 'GET', url, query }, res);
  return res;
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

test('json proxy: forwards payload with CDN cache header', async () => {
  let seen;
  globalThis.fetch = async (u) => { seen = String(u); return new Response(JSON.stringify({ statusCode: 200, data: { ongoing: [] } }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const res = await call(jsonProxy, '/api/otakudesu/home', { path: ['home'] });
  assert.equal(res.statusCode, 200);
  assert.equal(seen, 'https://anime-api-red-pi.vercel.app/otakudesu/home');
  assert.match(res.headers['cache-control'], /s-maxage=300/);
});

test('json proxy: search forwards trimmed q only', async () => {
  let seen;
  globalThis.fetch = async (u) => { seen = String(u); return Response.json({ statusCode: 200, data: { animeList: [] } }); };
  await call(jsonProxy, '/api/otakudesu/search?q=%20naruto%20&x=1', { path: ['search'] });
  assert.equal(seen, 'https://anime-api-red-pi.vercel.app/otakudesu/search?q=naruto');
});

test('json proxy: rejects unknown routes, traversal, empty search', async () => {
  globalThis.fetch = async () => { throw new Error('must not be called'); };
  for (const [url, path] of [
    ['/api/otakudesu/admin', ['admin']],
    ['/api/otakudesu/anime/..', ['anime', '..']],
    ['/api/otakudesu/anime/a/b', ['anime', 'a', 'b']],
    ['/api/otakudesu/search', ['search']],
    ['/api/otakudesu/anime', ['anime']],
  ]) assert.equal((await call(jsonProxy, url, { path })).statusCode, 400, url);
});

test('json proxy: upstream 403 is retried then surfaced as 502, never cached', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('blocked', { status: 403 }); };
  const res = await call(jsonProxy, '/api/otakudesu/anime/x', { path: ['anime', 'x'] });
  assert.equal(calls, 2);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.upstreamStatus, 403);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('json proxy: falls through to the next upstream and reports body snippet on total failure', async () => {
  process.env.ANIME_API_BASE = 'https://a.example, https://b.example/';
  try {
    const seen = [];
    globalThis.fetch = async (u) => { seen.push(String(u)); return String(u).startsWith('https://a.example') ? new Response('<b>Blocked</b> by WAF', { status: 403 }) : Response.json({ statusCode: 200, data: {} }); };
    assert.equal((await call(jsonProxy, '/api/otakudesu/home', { path: ['home'] })).statusCode, 200);
    assert.deepEqual(seen, ['https://a.example/otakudesu/home', 'https://b.example/otakudesu/home']);

    globalThis.fetch = async () => new Response('<b>Blocked</b> by WAF', { status: 403 });
    const res = await call(jsonProxy, '/api/otakudesu/episode/fallback-fail', { path: ['episode', 'fallback-fail'] });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.detail, 'Blocked by WAF');
    assert.equal(res.body.tried.length, 2);
  } finally { delete process.env.ANIME_API_BASE; }
});

test('health: reports each upstream', async () => {
  globalThis.fetch = async () => new Response('{"x":1}', { status: 403, headers: { 'content-type': 'application/json', server: 'cloudflare' } });
  const res = await call(health, '/api/health');
  assert.equal(res.body.ok, false);
  assert.equal(res.body.results[0].status, 403);
  assert.equal(res.body.results[0].server, 'cloudflare');
});

test('json proxy: 403 then 200 recovers on retry', async () => {
  let calls = 0;
  globalThis.fetch = async () => (++calls === 1 ? new Response('x', { status: 403 }) : Response.json({ statusCode: 200, data: {} }));
  assert.equal((await call(jsonProxy, '/api/otakudesu/episode/e1', { path: ['episode', 'e1'] })).statusCode, 200);
});

test('json proxy: upstream 404 stays 404; HTML body becomes 502', async () => {
  globalThis.fetch = async () => new Response('nf', { status: 404 });
  assert.equal((await call(jsonProxy, '/api/otakudesu/anime/x', { path: ['anime', 'x'] })).statusCode, 404);
  globalThis.fetch = async () => new Response('<html>', { status: 200 });
  assert.equal((await call(jsonProxy, '/api/otakudesu/anime/x', { path: ['anime', 'x'] })).statusCode, 502);
});

test('json proxy: path falls back to req.url when req.query.path is absent', async () => {
  let seen;
  globalThis.fetch = async (u) => { seen = String(u); return Response.json({ ok: 1 }); };
  await call(jsonProxy, '/api/otakudesu/server/a%20b', {});
  assert.equal(seen, 'https://anime-api-red-pi.vercel.app/otakudesu/server/a%20b');
});

test('img proxy: serves jpeg, sends same-site Referer, upgrades http', async () => {
  let seen;
  globalThis.fetch = async (u, init) => { seen = { url: String(u), referer: init.headers.Referer }; return new Response(JPEG, { status: 200, headers: { 'content-type': 'application/octet-stream' } }); };
  const res = await call(imgProxy, '/api/img', { u: 'http://otakudesu.example/wp-content/a.jpg' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.equal(seen.url, 'https://otakudesu.example/wp-content/a.jpg');
  assert.equal(seen.referer, 'https://otakudesu.example/');
  assert.match(res.headers['cache-control'], /s-maxage=2592000/);
});

test('img proxy: blocks internal targets', async () => {
  globalThis.fetch = async () => { throw new Error('must not be called'); };
  for (const u of ['https://127.0.0.1/a.jpg', 'https://localhost/a.jpg', 'https://169.254.169.254/x', 'https://[::1]/x', 'https://intranet/a.jpg', 'https://svc.internal/a.jpg', 'https://a.com:8443/x', 'https://user:pw@a.com/x', 'ftp://a.com/x', 'file:///etc/passwd', ''])
    assert.equal((await call(imgProxy, '/api/img', { u })).statusCode, 400, u);
});

test('img proxy: redirect into an internal host is refused', async () => {
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest' } });
  assert.equal((await call(imgProxy, '/api/img', { u: 'https://cdn.example.com/a.jpg' })).statusCode, 502);
});

test('img proxy: follows a safe redirect', async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? new Response(null, { status: 301, headers: { location: '/real.jpg' } }) : new Response(JPEG, { status: 200 }));
  assert.equal((await call(imgProxy, '/api/img', { u: 'https://cdn.example.com/a.jpg' })).statusCode, 200);
});

test('img proxy: rejects SVG/HTML even when labelled image/*', async () => {
  globalThis.fetch = async () => new Response('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', { status: 200, headers: { 'content-type': 'image/jpeg' } });
  assert.equal((await call(imgProxy, '/api/img', { u: 'https://cdn.example.com/a.jpg' })).statusCode, 415);
});

test('img proxy: size cap and upstream 403/404 mapping', async () => {
  globalThis.fetch = async () => new Response(Buffer.concat([JPEG, Buffer.alloc(7 * 1024 * 1024)]), { status: 200 });
  assert.equal((await call(imgProxy, '/api/img', { u: 'https://cdn.example.com/big.jpg' })).statusCode, 502);
  globalThis.fetch = async () => new Response('', { status: 403 });
  assert.equal((await call(imgProxy, '/api/img', { u: 'https://cdn.example.com/a.jpg' })).statusCode, 502);
  globalThis.fetch = async () => new Response('', { status: 404 });
  assert.equal((await call(imgProxy, '/api/img', { u: 'https://cdn.example.com/a.jpg' })).statusCode, 404);
});

test('json proxy: serves last good payload (X-Stale) when upstream later fails', async () => {
  globalThis.fetch = async () => Response.json({ statusCode: 200, data: { marker: 'fresh' } });
  assert.equal((await call(jsonProxy, '/api/otakudesu/anime/stale-1', { path: ['anime', 'stale-1'] })).statusCode, 200);
  globalThis.fetch = async () => Response.json({ statusCode: 403, data: null }, { status: 403 });
  const res = await call(jsonProxy, '/api/otakudesu/anime/stale-1', { path: ['anime', 'stale-1'] });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-stale'], '1');
  assert.equal(res.body.data.marker, 'fresh');
  const other = await call(jsonProxy, '/api/otakudesu/anime/never-seen', { path: ['anime', 'never-seen'] });
  assert.equal(other.statusCode, 502);
});
