# xs0cietyHUB — Anime Streaming

Anime streaming platform by **xs0cietyHUB** (alias **xs0ciety505**).
Dibangun dengan Vanilla JS + ES Modules. Tanpa build step, siap deploy ke Vercel.

## Struktur

- `public/` — static assets (index.html, css, js, manifest, img)
- `vercel.json` — SPA rewrite + security headers
- `package.json` — dev script (npx serve)

## Setup

1. Clone repo.
2. **Wajib**: taruh file foto Anda di `public/img/xs0ciety.png`.
   Jika tidak ada, halaman developer akan menampilkan fallback `x0`.
3. Local dev: `npm run dev` → buka `http://localhost:3000`

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

**Tidak ada.** Proyek tidak memerlukan rahasia apa pun.

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
- Endpoint `/otakudesu/anime/...` dan `/otakudesu/episode/...` **kadang mengembalikan 403** dari upstream. Aplikasi menampilkan error state jujur dan tombol retry.
- Tidak ada proxy server-side. Semua fetch langsung dari browser ke API publik.

## Keamanan

- Semua data API di-render via `textContent`/DOM API, **tidak ada `innerHTML`** untuk data API.
- URL divalidasi lewat konstruktor `URL` + cek `protocol === 'https:'`.
- Iframe memakai `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"` + `referrerpolicy="no-referrer"`.
- CSP melarang `unsafe-eval` dan membatasi `connect-src` hanya ke API.
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