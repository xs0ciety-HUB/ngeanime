import { h, poster, toast } from './components.js';
import { route, start, navigate } from './router.js';
import { getHome, searchAnime, getAnimeDetail, getEpisodeDetail, getServerUrl } from './api.js';
import { mountPlayer } from './player.js';

const NAV_ITEMS = [
  { path: '/search', label: 'Pencarian', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' },
  { path: '/', label: 'Beranda', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
  { path: '/collection', label: 'Koleksi', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' },
  { path: '/developer', label: 'Developer', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>' },
];

function initNav() {
  const nav = document.getElementById('bottom-nav');
  nav.innerHTML = NAV_ITEMS.map(item => `
    <a href="${item.path}" data-link class="${location.pathname === item.path ? 'active' : ''}">
      ${item.icon}
      <span>${item.label}</span>
    </a>
  `).join('');
}

function updateActiveNav() {
  document.querySelectorAll('#bottom-nav a').forEach(a => {
    const path = new URL(a.href).pathname;
    if (path === location.pathname) a.classList.add('active');
    else a.classList.remove('active');
  });
}

// --- Beranda ---
function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="grid">' + Array(6).fill('<div class="skeleton skeleton-poster"></div>').join('') + '</div>';

  getHome().then(({ ongoing, completed }) => {
    const renderList = (list) => list.map(a => `
      <li class="card">
        <a href="/anime/${a.id}" data-link>
          ${poster(a.poster, a.title).outerHTML}
          <div class="card-title">${a.title}</div>
          <div class="card-meta">${a.episodes || ''} ${a.releaseDay ? '• ' + a.releaseDay : ''}</div>
        </a>
      </li>
    `).join('');

    app.innerHTML = `
      <h1>XSOCIETY ANIME</h1>
      <p style="color:var(--text-muted);margin-bottom:1rem;">Streaming anime subtitle Indonesia.</p>
      <h2>Sedang Tayang</h2>
      <ul class="grid">${renderList(ongoing)}</ul>
      <h2>Selesai</h2>
      <ul class="grid">${renderList(completed)}</ul>
    `;
  }).catch(() => {
    app.innerHTML = '<div class="state"><p>Gagal memuat data. Periksa koneksi internetmu.</p><button class="btn btn-primary" onclick="location.reload()">Coba Lagi</button></div>';
  });
}

// --- Pencarian ---
function renderSearch() {
  const app = document.getElementById('app');
  const urlParams = new URLSearchParams(location.search);
  const initialQ = urlParams.get('q') || '';

  app.innerHTML = `
    <h1>Cari Anime</h1>
    <form id="search-form" style="display:flex;gap:0.5rem;margin-bottom:1.5rem;">
      <input type="search" name="q" value="${initialQ}" placeholder="Ketik judul anime..." style="flex:1;padding:0.6rem;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--text);">
      <button type="submit" class="btn btn-primary">Cari</button>
    </form>
    <div id="search-results"></div>
  `;

  const form = document.getElementById('search-form');
  const results = document.getElementById('search-results');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    if (q) history.pushState(null, '', `/search?q=${encodeURIComponent(q)}`);
    runSearch(q);
  });

  async function runSearch(q) {
    if (!q) {
      results.innerHTML = '<p class="state">Masukkan kata kunci pencarian.</p>';
      return;
    }
    results.innerHTML = '<div class="grid">' + Array(6).fill('<div class="skeleton skeleton-poster"></div>').join('') + '</div>';
    try {
      const list = await searchAnime(q);
      if (list.length === 0) {
        results.innerHTML = '<p class="state">Anime tidak ditemukan.</p>';
        return;
      }
      results.innerHTML = `<ul class="grid">${list.map(a => `
        <li class="card">
          <a href="/anime/${a.id}" data-link>
            ${poster(a.poster, a.title).outerHTML}
            <div class="card-title">${a.title}</div>
            <div class="card-meta">${a.score || ''} ${a.status ? '• ' + a.status : ''}</div>
          </a>
        </li>
      `).join('')}</ul>`;
    } catch {
      results.innerHTML = '<p class="state">Pencarian gagal. Coba lagi.</p>';
    }
  }

  if (initialQ) runSearch(initialQ);
  else results.innerHTML = '<p class="state">Masukkan judul anime yang ingin dicari.</p>';
}

// --- Detail Anime & Streaming ---
function renderDetail({ params }) {
  const app = document.getElementById('app');
  const animeId = params[0];
  app.innerHTML = '<div class="state"><p>Memuat detail anime...</p></div>';

  getAnimeDetail(animeId).then(anime => {
    app.innerHTML = `
      <article class="detail-layout">
        <div>
          ${poster(anime.poster, anime.title, 'detail-poster').outerHTML}
        </div>
        <div class="detail-info">
          <h1>${anime.title}</h1>
          <ul class="tags">${anime.genres.map(g => `<li>${g}</li>`).join('')}</ul>
          <p style="font-size:0.85rem;color:var(--text-muted);">Status: ${anime.status} • Skor: ${anime.score}</p>
          <p class="synopsis">${anime.synopsis}</p>
        </div>
      </article>
      <section style="margin-top:2rem;">
        <h2>Nonton Anime</h2>
        <div class="player-wrapper" id="player-wrapper">
          <div class="state"><p>Pilih episode di bawah untuk mulai menonton.</p></div>
        </div>
        <div class="episode-list" id="episode-list"></div>
      </section>
    `;

    const epList = document.getElementById('episode-list');
    const playerWrapper = document.getElementById('player-wrapper');

    if (anime.episodes.length === 0) {
      epList.innerHTML = '<p class="state">Belum ada episode tersedia.</p>';
      return;
    }

    epList.innerHTML = anime.episodes.map(ep => `
      <button class="episode-btn" data-ep-id="${ep.episodeId}">${ep.title || 'Episode'}</button>
    `).join('');

    epList.addEventListener('click', async (e) => {
      const btn = e.target.closest('.episode-btn');
      if (!btn) return;
      document.querySelectorAll('.episode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const epId = btn.dataset.epId;
      playerWrapper.innerHTML = '<div class="state"><p>Memuat video...</p></div>';

      try {
        const epDetail = await getEpisodeDetail(epId);
        const server = epDetail.serverList?.[0]?.serverList?.[0];
        if (!server) {
          playerWrapper.innerHTML = '<div class="state"><p>Link video tidak ditemukan untuk episode ini.</p></div>';
          return;
        }
        const videoUrl = await getServerUrl(server.serverId);
        await mountPlayer(playerWrapper, videoUrl);
      } catch {
        playerWrapper.innerHTML = '<div class="state"><p>Gagal memuat video. Coba episode lain.</p></div>';
      }
    });
  }).catch(() => {
    app.innerHTML = '<div class="state"><p>Gagal memuat detail anime. Mungkin ID tidak valid.</p><a href="/" data-link class="btn btn-primary">Kembali</a></div>';
  });
}

// --- Koleksi ---
function renderCollection() {
  const app = document.getElementById('app');
  let list = [];
  try {
    const raw = localStorage.getItem('xsociety_collection_v1');
    list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
  } catch { list = []; }

  if (list.length === 0) {
    app.innerHTML = '<div class="state"><p>Koleksi masih kosong. Tambahkan anime dari halaman detail.</p><a href="/" data-link class="btn btn-primary">Jelajahi Anime</a></div>';
    return;
  }
  app.innerHTML = `
    <h1>Koleksi Saya</h1>
    <ul class="grid">
      ${list.map(a => `
        <li class="card">
          <a href="/anime/${a.id}" data-link>
            ${poster(a.poster, a.title).outerHTML}
            <div class="card-title">${a.title}</div>
            <div class="card-meta">${a.episodes || ''}</div>
          </a>
        </li>
      `).join('')}
    </ul>
  `;
}

// --- Developer Profile ---
function renderDeveloper() {
  const app = document.getElementById('app');
  const SOCIALS = [
    { name: 'TikTok', handle: '@xprimesociety', url: 'https://www.tiktok.com/@xprimesociety' },
    { name: 'Instagram', handle: '@xs0ciety-hub', url: 'https://www.instagram.com/xs0ciety-hub/' },
    { name: 'Telegram', handle: '@xs0cietyHUB', url: 'https://t.me/xs0cietyHUB' },
  ];
  app.innerHTML = `
    <div class="dev-card">
      <img class="avatar" src="/img/xs0ciety.png" alt="Foto Profil xs0cietyHUB" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'140\\' height=\\'140\\' viewBox=\\'0 0 140 140\\'><rect width=\\'140\\' height=\\'140\\' fill=\\'%23151a23\\'/><circle cx=\\'70\\' cy=\\'50\\' r=\\'25\\' fill=\\'%232a303c\\'/><path d=\\'M35 120c0-19 16-35 35-35s35 16 35 35\\' fill=\\'%232a303c\\'/></svg>';">
      <div>
        <h1 style="font-size:1.5rem;">xs0cietyHUB</h1>
        <p style="color:var(--text-muted);">xs0ciety505</p>
      </div>
      <ul class="social-list">
        ${SOCIALS.map(s => `
          <li>
            <a href="${s.url}" target="_blank" rel="noopener noreferrer">
              <span>${s.name}</span>
              <span style="margin-left:auto;color:var(--text-muted);font-size:0.85rem;">${s.handle}</span>
            </a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

// --- Inisialisasi ---
initNav();

route('/', renderHome);
route('/search', renderSearch);
route('/anime/([^/]+)', renderDetail);
route('/collection', renderCollection);
route('/developer', renderDeveloper);

window.addEventListener('popstate', updateActiveNav);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (a) setTimeout(updateActiveNav, 50);
});

start();