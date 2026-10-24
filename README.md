# xs0cietyHUB — Anime Streaming

Anime streaming platform by **xs0cietyHUB** (alias **xs0ciety505**).
Dibangun dengan Vanilla JS + ES Modules. Tanpa build step, siap deploy ke Vercel.

## Struktur

- `public/` — static assets (index.html, css, js, manifest, img)
- `api/otakudesu/[...path].js` — proxy JSON server-side ke API anime (retry, timeout, mapping error)
- `api/img.js` — proxy gambar poster (menambah Referer situs asal, anti-SSRF, hanya gambar raster)
- `vercel.json` — SPA rewrite (kecuali `/api/*`), durasi function, security headers
- `test/api.test.mjs` — test handler (`npm test`, tanpa jaringan)

## Setup

1. Clone repo.
2. **Wajib**: taruh file foto Anda di `public/img/xs0ciety.png`.
   Jika tidak ada, halaman developer akan menampilkan fallback `x0`.
3. Local dev: `npm run dev` (memakai `vercel dev`, supaya `/api/*` ikut jalan) → buka `http://localhost:3000`.
   `npx serve public` **tidak** menjalankan `/api`, jadi beranda akan error.

## Deploy ke Vercel

1. Push ke GitHub.
2. Import project di [vercel.com](https://vercel.com/new).
3. Framework preset: **Other**.
4. Build command: (kosongkan). Output directory: (kosongkan).
5. Deploy.

`vercel.json` sudah mengonfigurasi:
- SPA rewrite (semua route → `index.html`).
- CSP ketat, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Environment Variables

Atur di Vercel: Project → Settings → Environment Variables → isi Name dan Value → Save → tab Deployments → Redeploy.

| Variabel | Wajib | Fungsi |
|---|---|---|
| `ANIME_API_BASE` | **Ya** | Base URL API upstream milikmu, mis. `https://nama-api-kamu.vercel.app`. Tidak ada nilai bawaan, supaya alamat itu tidak ikut bocor lewat kode di GitHub. Boleh lebih dari satu, pisah koma |
| `ANIME_SOURCE` | Tidak (`oploverz`) | Sumber di API upstream: `oploverz`, `otakudesu`, `kuramanime`, dst. |
| `HEALTH_TOKEN` | Tidak | Kata sandi acak panjang untuk membuka `/api/health?token=...`. Tanpa ini `/api/health` selalu 404 |
| `UPSTREAM_BYPASS_SECRET` | Tidak | Secret "Protection Bypass for Automation" Vercel, dikirim ke upstream sebagai header `x-vercel-protection-bypass` |
| `IMG_HOST_ALLOW` | Tidak | Mengganti daftar host gambar yang boleh diambil `/api/img` (suffix, pisah koma). Bawaan: `wp.com, oploverz.am, otakudesu.*, myanimelist.net` |

## Endpoint API (terverifikasi)

Base URL: `https://wajik-anime-api.vercel.app`

| Endpoint | Fungsi |
|---|---|
| `GET /otakudesu/home` | Beranda (ongoing + complete) |
| `GET /otakudesu/search?q={query}` | Pencarian |
| `GET /otakudesu/anime/{animeId}` | Detail anime + episode list |
| `GET /otakudesu/episode/{episodeId}` | Detail episode + streaming URL + server |
| `GET /otakudesu/server/{serverId}` | URL embed server tertentu |

### Catatan penting

- Sumber streaming berupa **URL embed (iframe)**, bukan MP4/HLS langsung. Player menggunakan `<iframe>` dengan `sandbox`.
- Upstream **kadang mengembalikan 403/5xx**. Proxy mencoba ulang sekali; bila tetap gagal, UI menampilkan pesan error dan tombol retry. Error tidak di-cache.
- Browser **tidak pernah** memanggil API upstream atau CDN gambar langsung. Semua lewat `/api/otakudesu/*` dan `/api/img` di origin sendiri, jadi tidak ada CORS, tidak ada proxy publik pihak ketiga.
- Player menyediakan tombol server. Jika server utama gagal tampil, pilih server lain di bawah player.

## Diagnosis error 403 / 502

Buka `https://<domain-anda>/api/health?token=<HEALTH_TOKEN>`. Endpoint ini menanyakan tiap upstream dan menampilkan status, header `server`, dan cuplikan body. Jangan bagikan URL yang memuat token itu.

- `403` dengan `statusMessage: Forbidden` dalam hitungan milidetik: situs sumber memblokir IP datacenter Vercel. Ganti `ANIME_SOURCE` ke sumber lain yang hidup, atau jalankan API upstream di VPS / komputer dengan IP biasa.
- `404` di halaman tonton: pesan error kini memuat alasan dari upstream. Cek bahwa id episode yang dikirim sesuai yang diharapkan API.

## Keamanan

### Melindungi API dari scraper dan pencuri

Yang sudah ada di kode:
- Alamat API upstream hanya ada di environment variable server. Tidak ada di JS browser, tidak ada nilai bawaan di repo, dan tidak pernah dikembalikan ke klien (galat hanya memuat status dan pesan).
- `/api/otakudesu/*` dan `/api/img` menolak (403) request dari situs lain dan klien tanpa header browser (curl, skrip sederhana). Ini mencegah hotlink dan pemakaian API-mu oleh aplikasi lain.
- Batas per IP: 90 request JSON dan 600 request gambar per menit (429 + `Retry-After`).
- `/api/img` hanya mengambil dari host poster yang dikenal, bukan proxy gambar terbuka. Tidak menerima IP, localhost, port lain, atau file selain gambar raster.
- `/api/health` mati (404) kecuali `HEALTH_TOKEN` diatur dan dikirim.

Batasan yang jujur: JS di browser tidak bisa dirahasiakan, dan header `Sec-Fetch-Site` bisa dipalsukan oleh scraper yang gigih. Batas per IP di kode hanya berlaku per instance function. Untuk perlindungan yang sebenarnya, aktifkan juga di dashboard Vercel:
1. **Firewall → Add Rule → Rate Limit** untuk path `/api/*`, misalnya 60 request per menit per IP.
2. **Project upstream → Settings → Deployment Protection**: aktifkan, buat "Protection Bypass for Automation", lalu isi secret-nya ke `UPSTREAM_BYPASS_SECRET` di proyek ini. Setelah itu orang yang mengetahui URL upstream-mu tidak bisa memakainya. Fitur ini bergantung pada paket Vercel-mu.
3. Kalau URL upstream pernah terpublikasi (di repo publik atau chat), anggap sudah bocor: buat ulang project upstream dengan nama baru lalu ganti `ANIME_API_BASE`.

- Semua data API di-render via `textContent`/DOM API, **tidak ada `innerHTML`** untuk data API.
- URL divalidasi lewat konstruktor `URL` + cek `protocol === 'https:'`.
- Iframe memakai `sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups"` + `referrerpolicy="strict-origin-when-cross-origin"` (host embed umumnya menolak request tanpa Referer sama sekali).
- CSP melarang `unsafe-eval`; `connect-src` dan `img-src` hanya `'self'` (gambar selalu lewat `/api/img`).
- Koleksi disimpan di `localStorage` dengan schema validation; JSON rusak dihapus otomatis.
- Query search dibatasi 60 karakter, di-debounce 350ms, dan request lama dibatalkan via `AbortController`.

## Keterbatasan

- **Streaming bergantung sepenuhnya pada API pihak ketiga.** Jika upstream memblokir request (403) atau timeout, player menampilkan error — bukan tombol palsu.
- **SPA statis**: metadata per-halaman (title, canonical, OG) di-set via JS. Crawler yang tidak merender JS akan melihat metadata default. Tidak ada SSR/prerender.
- **Tanpa `robots.txt` / `sitemap.xml`** sesuai permintaan. Konsekuensi: penemuan halaman detail bergantung pada internal link; Google tidak dijamin mengindeks cepat.
- **Koleksi hanya lokal** — tidak tersinkronisasi antarperangkat.
- **Tidak ada rate limiting** di sisi client. Rate limit bergantung pada API upstream.

## Lisensi

UNLICENSED. © 2026 xs0cietyHUB — xs0ciety505