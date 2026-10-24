import { h, poster } from './dom.js';
import * as api from './api.js';
import { route, onNotFound, start } from './router.js';

const app = document.getElementById('app');

// --- Ikon SVG ---
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
};

// --- Navigasi Bawah ---
const TABS = [
  { path: '/', label: 'Beranda', icon: ICONS.home },
  { path: '/search', label: 'Cari', icon: ICONS.search },
];

function updateNav() {
  const nav = document.getElementById('bottom-nav');
  nav.innerHTML = TABS.map(t => `
    <a href="${t.path}" data-link class="${location.pathname === t.path ? 'active' : ''}">
      ${t.icon} <span>${t.label}</span>
    </a>
  `).join('');
}

// --- Helper UI ---
function showLoading() {
  app.innerHTML = '<div class="grid">' + Array(6).fill('<div class="skeleton skeleton-poster"></div>').join('') + '</div>';
}

function showError(msg) {
  app.innerHTML = `<div class="state"><p>${msg}</p><button class="btn btn-primary" onclick="location.reload()">Coba Lagi</button></div>`;
}

// --- Halaman Beranda ---
route('/', async () => {
  updateNav();
  app.innerHTML = `<h1>Temukan Anime</h1><p class="lede">Streaming subtitle Indonesia langsung dari browser.</p><div id="home-content"></div>`;
  const container = document.getElementById('home-content');
  container.innerHTML = '<div class="grid">' + Array(6).fill('<div class="skeleton skeleton-poster"></div>').join('') + '</div>';

  try {
    const data = await api.getHome();
    const renderList = (list) => list.map(a => `
      <li class="card">
        <a href="/anime/${a.animeId}" data-link>
          ${poster(a.poster, a.title).outerHTML}
          <div class="card-title">${a.title}</div>
          <div class="card-meta">${a.episodes} Eps • ${a.releaseDay || ''}</div>
        </a>
      </li>
    `).join('');

    container.innerHTML = `
      <h2>Sedang Tayang</h2>
      <ul class="grid">${renderList(data.ongoing)}</ul>
      <h2>Selesai</h2>
      <ul class="grid">${renderList(data.completed)}</ul>
    `;
  } catch (e) {
    showError('Gagal memuat data anime. Periksa koneksi atau coba lagi nanti.');
  }
});

// --- Halaman Pencarian ---
route('/search', async ({ query }) => {
  updateNav();
  const q = query.get('q') || '';
  app.innerHTML = `
    <h1>Cari Anime</h1>
    <form id="search-form" class="hero" style="margin-bottom:1rem; display:flex; gap:0.5rem;">
      <input type="search" name="q" value="${q}" placeholder="Ketik judul anime..." style="flex:1; padding:0.6rem; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text);">
      <button type="submit" class="btn btn-primary">Cari</button>
    </form>
    <div id="search-results"></div>
  `;

  const form = document.getElementById('search-form');
  const results = document.getElementById('search-results');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newQ = form.q.value.trim();
    if (newQ) history.pushState(null, '', `/search?q=${encodeURIComponent(newQ)}`);
    runSearch(newQ);
  });

  async function runSearch(keyword) {
    if (!keyword) {
      results.innerHTML = '<p class="state">Masukkan kata kunci pencarian.</p>';
      return;
    }
    results.innerHTML = '<div class="grid">' + Array(6).fill('<div class="skeleton skeleton-poster"></div>').join('') + '</div>';
    try {
      const res = await api.searchAnime(keyword);
      const list = res.data?.animeList || [];
      if (list.length === 0) {
        results.innerHTML = '<p class="state">Anime tidak ditemukan.</p>';
        return;
      }
      results.innerHTML = `<ul class="grid">${list.map(a => `
        <li class="card">
          <a href="/anime/${a.animeId}" data-link>
            ${poster(a.poster, a.title).outerHTML}
            <div class="card-title">${a.title}</div>
            <div class="card-meta">${a.episodes || ''}</div>
          </a>
        </li>
      `).join('')}</ul>`;
    } catch (e) {
      showError('Pencarian gagal. Coba lagi.');
    }
  }

  if (q) runSearch(q);
  else results.innerHTML = '<p class="state">Masukkan judul anime yang ingin dicari.</p>';
});

// --- Halaman Detail Anime & Streaming ---
route('/anime/([^/]+)', async ({ params }) => {
  updateNav();
  const animeId = params[0];
  app.innerHTML = `<div class="state"><p>Memuat detail anime...</p></div>`;

  try {
    const res = await api.getAnimeDetail(animeId);
    const anime = res.data;
    if (!anime) throw new Error('Data anime kosong');

    // Render UI Detail
    app.innerHTML = `
      <article class="anime-detail">
        <div>
          ${poster(anime.poster, anime.title).outerHTML.replace('card-poster', 'anime-poster')}
        </div>
        <div class="anime-info">
          <h1>${anime.title}</h1>
          <ul class="anime-tags">${(anime.genres || []).map(g => `<li>${g}</li>`).join('')}</ul>
          <dl class="anime-facts">
            <dt>Status</dt><dd>${anime.status || '-'}</dd>
            <dt>Episode</dt><dd>${anime.totalEpisodes || '?'}</dd>
            <dt>Skor</dt><dd>${anime.score || '-'}</dd>
          </dl>
          <p class="anime-synopsis">${anime.synopsis || 'Sinopsis belum tersedia.'}</p>
        </div>
      </article>
      <section class="player-section" id="player-section">
        <h2>Nonton Anime</h2>
        <div class="video-wrapper" id="video-wrapper">
          <div class="state"><p>Pilih episode di bawah untuk mulai menonton.</p></div>
        </div>
        <div class="episode-list" id="episode-list"></div>
      </section>
    `;

    const epList = document.getElementById('episode-list');
    const videoWrapper = document.getElementById('video-wrapper');

    if (anime.episodes && anime.episodes.length > 0) {
      epList.innerHTML = anime.episodes.map(ep => `
        <button class="episode-btn" data-ep-id="${ep.episodeId}">${ep.title || `Episode ${ep.episodeNumber}`}</button>
      `).join('');

      epList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.episode-btn');
        if (!btn) return;

        // Tandai aktif
        document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const epId = btn.dataset.epId;
        videoWrapper.innerHTML = `<div class="state"><p>Memuat video...</p></div>`;

        try {
          const streamRes = await api.getEpisodeStream(epId);
          const streamData = streamRes.data;
          // Cari link streaming utama (prioritas: 720p, lalu 480p, lalu default)
          let videoUrl = null;
          if (streamData.streams && streamData.streams.length > 0) {
            // Coba cari kualitas 720p atau 480p
            const preferred = streamData.streams.find(s => s.quality === '720p') 
                           || streamData.streams.find(s => s.quality === '480p') 
                           || streamData.streams[0];
            videoUrl = preferred.url;
          } else if (streamData.streamUrl) {
            videoUrl = streamData.streamUrl;
          }

          if (videoUrl) {
            videoWrapper.innerHTML = `<video controls autoplay src="${videoUrl}"></video>`;
          } else {
            videoWrapper.innerHTML = `<div class="state"><p>Link video tidak ditemukan untuk episode ini.</p></div>`;
          }
        } catch (err) {
          videoWrapper.innerHTML = `<div class="state"><p>Gagal memuat video. Coba episode lain.</p></div>`;
        }
      });
    } else {
      epList.innerHTML = '<p class="state">Belum ada episode tersedia.</p>';
    }
  } catch (e) {
    app.innerHTML = `<div class="state"><p>Gagal memuat detail anime. Mungkin ID tidak valid.</p><a href="/" data-link class="btn btn-primary">Kembali ke Beranda</a></div>`;
  }
});

// --- 404 ---
onNotFound(() => {
  updateNav();
  app.innerHTML = `<div class="state"><h1 style="font-size:4rem; color:var(--pink);">404</h1><p>Halaman tidak ditemukan.</p><a href="/" data-link class="btn btn-primary">Ke Beranda</a></div>`;
});

// --- Inisialisasi ---
start();