export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse URL request asli dari Vercel (contoh: /api/otakudesu/home?page=1)
  const parsedUrl = new URL(req.url, 'http://localhost');
  let apiPath = parsedUrl.pathname;

  // Buang prefix '/api/' agar menyisakan 'otakudesu/home'
  if (apiPath.startsWith('/api/')) {
    apiPath = apiPath.slice(5);
  } else if (apiPath.startsWith('/')) {
    apiPath = apiPath.slice(1);
  }

  // Validasi ketat: Hanya izinkan path otakudesu (mencegah open proxy)
  if (!apiPath.startsWith('otakudesu/')) {
    return res.status(400).json({ error: 'Path tidak diizinkan oleh proxy' });
  }

  const targetUrl = `https://wajik-anime-api.vercel.app/${apiPath}${parsedUrl.search}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Referer': 'https://otakudesu.cloud/',
        'Origin': 'https://otakudesu.cloud',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ 
        error: `Upstream error: ${response.status}`,
        detail: text.slice(0, 200)
      });
    }

    const data = await response.json();
    
    // Simpan cache di Vercel Edge selama 60 detik
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Gagal menghubungi API upstream' });
  }
}
