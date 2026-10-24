import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsonProxy = require('../api/otakudesu/[...path].js');
const imgProxy = require('../api/img.js');

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
  assert.equal(seen, 'https://wajik-anime-api.vercel.app/otakudesu/home');
  assert.match(res.headers['cache-control'], /s-maxage=300/);
});

test('json proxy: search forwards trimmed q only', async () => {
  let seen;
  globalThis.fetch = async (u) => { seen = String(u); return Response.json({ statusCode: 200, data: { animeList: [] } }); };
  await call(jsonProxy, '/api/otakudesu/search?q=%20naruto%20&x=1', { path: ['search'] });
  assert.equal(seen, 'https://wajik-anime-api.vercel.app/otakudesu/search?q=naruto');
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
  assert.equal(seen, 'https://wajik-anime-api.vercel.app/otakudesu/server/a%20b');
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
