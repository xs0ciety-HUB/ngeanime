const ALLOWED_PREFIX = '/otakudesu/';
const TARGET_BASE = 'https://wajik-anime-api.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pathSegments = req.query.path;
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  const targetPath = ALLOWED_PREFIX + pathSegments.join('/');
  const url = new URL(targetPath, TARGET_BASE);

  // Validasi ketat: hanya boleh ke host target dan prefix yang diizinkan
  if (url.origin !== TARGET_BASE || !url.pathname.startsWith(ALLOWED_PREFIX)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Teruskan query string (hanya parameter yang aman)
  const safeParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (typeof value === 'string' && value.length < 200) {
      safeParams.set(key, value);
    }
  }
  url.search = safeParams.toString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const upstream = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    clearTimeout(timeout);

    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return res.status(502).json({ error: 'Upstream returned non-JSON' });
    }

    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(upstream.status).json(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    return res.status(502).json({ error: 'Upstream fetch failed' });
  }
}