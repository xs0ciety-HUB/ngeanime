export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // req.url akan berisi '/api/otakudesu/home?page=1'
  // Kita hilangkan '/api/' di depannya
  const fullUrl = req.url || '';
  const pathWithQuery = fullUrl.replace(/^\/api\/?/, '');
  
  // Pisahkan path dan query string
  const [rawPath, queryString] = pathWithQuery.split('?');
  
  // Validasi ketat: hanya izinkan path otakudesu
  if (!rawPath || !rawPath.startsWith('otakudesu/')) {
    return res.status(400).json({ 
      error: 'Path tidak diizinkan oleh proxy',
      received: rawPath 
    });
  }

  const targetUrl = `https://wajik-anime-api.vercel.app/${rawPath}${queryString ? '?' + queryString : ''}`;

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
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(502).json({ error: 'Gagal menghubungi API upstream' });
  }
}