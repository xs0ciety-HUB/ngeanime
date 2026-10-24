import { h, poster, toast } from './dom.js';
import * as api from './api.js';
import {
  readFavorites, isFavorite, toggleFavorite,
  readWatch, getWatch, setWatch, removeWatch, WATCH_STATUSES,
} from './store.js';
import { route, onNotFound, start } from './router.js';

const main = document.getElementById('main');
const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON = {
  home: ['M3 10.5L12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4.2-4.2'],
  bookmark: ['M6 3h12v18l-6-4.5L6 21z'],
  code: ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13.5 5l-3 14'],
  instagram: ['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M17.5 6.5h.01'],
  telegram: ['M21 4L3 11l6 2.2L11.5 20l3.2-3.6 4.3 3.1z', 'M9 13.2L17 7'],
  tiktok: ['M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5', 'M14 3c.4 2.6 2.2 4.2 5 4.5'],
  play: ['M5 3l14 9-14 9V3z'],
};

const TABS = [
  { href: '/', label: 'Beranda', icon: 'home' },
  { href: '/browse', label: 'Jelajah', icon: 'search' },
  { href: '/favorites', label: 'Koleksi', icon: 'bookmark' },
  { href: '/developer', label: 'Developer', icon: 'code' },
];

const SOCIALS = [
  { icon: 'tiktok', label: 'TikTok', handle: '@xprimesociety', href: 'https://www.tiktok.com/@xprimesociety' },
  { icon: 'instagram', label: 'Instagram', handle: '@xs0ciety_hub', href: 'https://www.instagram.com/xs0ciety_hub/' },
  { icon: 'telegram', label: 'Telegram', handle: 'xs0cietyHUB', href: 'https://t.me/xs0cietyHUB' },
];

function icon(name, size = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICON[name] || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d); svg.append(p);
  }
  return svg;
}

function show(title, ...nodes) {
  document.title = title ? `${title} — Kakemono` : 'Kakemono — Nonton Anime';
  main.replaceChildren(...nodes.flat().filter(Boolean));
  document.querySelectorAll('#tabbar a').forEach(a => {
    if (a.pathname === location.pathname) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  main.focus({ preventScroll: true });
  scrollTo(0, 0);
}

const MESSAGES = {
  network: 'Koneksi terputus. Periksa internetmu lalu coba lagi.',
  rate: 'Terlalu banyak permintaan. Tunggu sebentar.',
  server: 'Server anime sedang bermasalah.',
  data: 'Data tidak dapat dibaca.',
};

function errorState(err, retry) {
  return h('div', { class: 'state', role: 'alert' },
    h('p', {}, MESSAGES[err.kind] || 'Terjadi kesalahan sistem.'),
    retry ? h('button', { class: 'btn primary', type: 'button', onclick: retry }, 'Coba Lagi') : null);
}

const emptyState = (text, link) => h('div', { class: 'state' }, h('p', {}, text), link);
const skeletons = n => h('ul', { class: 'grid', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('li', { class: 'sk' })));
const browseLink = () => h('a', { class: 'btn primary', href: '/browse', 'data-link': '' }, 'Cari Anime');

function favButton(item, cls = '') {
  const saved = isFavorite(item.id);
  const btn = h('button', { class: `fav ${cls}`.trim(), type: 'button', 'aria-pressed': String(saved) }, saved ? 'Tersimpan' : 'Simpan');
  btn.addEventListener('click', () => {
    const r = toggleFavorite(item);
    const nowSaved = isFavorite(item.id);
    btn.setAttribute('aria-pressed', String(nowSaved));
    btn.textContent = nowSaved ? 'Tersimpan' : 'Simpan';
    toast(!r.ok ? 'Gagal menyimpan' : nowSaved ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
    if (location.pathname === '/favorites' && !nowSaved) renderFavorites();
  });
  return btn;
}

// Mapping data dari Wajik API
const toItem = (a) => ({
  id: a.animeId || a.id,
  title: a.title || 'Tanpa judul',
  image: a.poster || null,
  type: a.type || '',
  year: a.year || null,
  score: a.score || null,
  episodes: a.episodes || null,
});

function card(item, extra = null) {
  if (!item) return null;
  const sub = [item.type, item.year].filter(Boolean).join(' • ');
  return h('li', { class: 'card' },
    h('a', { href: `/anime/${item.id}`, 'data-link': '' },
      poster(item.title, item.image),
      h('h3', {}, item.title),
      h('div', { class: 'meta' }, sub, item.score ? [' • ', h('span', { class: 'score' }, item.score)] : null)),
    extra,
    favButton(item));
}

// --- BERANDA ---
route('/', async ({ signal }) => {
  const ongoingBody = h('div', {}, skeletons(6));
  const completedBody = h('div', {}, skeletons(6));
  
  show('', h('div', { class: 'hero' },
    h('div', {},
      h('h1', {}, 'Nonton anime subtitle Indonesia.'),
      h('p', { class: 'lede' }, 'Streaming anime tanpa ribet. Catat progres tontonanmu langsung di browser.'),
      h('a', { class: 'btn primary', href: '/browse', 'data-link': '' }, 'Mulai Jelajah')),
    h('div', {})),
    h('section', {}, h('h2', {}, 'Sedang Tayang'), ongoingBody),
    h('section', {}, h('h2', {}, 'Selesai Tayang'), completedBody));

  try {
    const res = await api.getHome();
    const ongoing = (res.data?.ongoing?.animeList || []).map(toItem);
    const completed = (res.data?.completed?.animeList || []).map(toItem);
    
    ongoingBody.replaceChildren(ongoing.length ? h('ul', { class: 'grid' }, ongoing.map(i => card(i))) : emptyState('Belum ada data.'));
    completedBody.replaceChildren(completed.length ? h('ul', { class: 'grid' }, completed.map(i => card(i))) : emptyState('Belum ada data.'));
  } catch (e) {
    ongoingBody.replaceChildren(errorState(e, () => location.reload()));
    completedBody.replaceChildren(errorState(e, () => location.reload()));
  }
});

// --- JELAJAH ---
route('/browse', ({ query }) => {
  const q = query.get('q') || '';
  const results = h('div', {});
  const input = h('input', { type: 'search', placeholder: 'Cari judul anime...', value: q });
  
  const form = h('form', { class: 'bar', onsubmit: e => { e.preventDefault(); history.replaceState(null, '', `/browse?q=${encodeURIComponent(input.value)}`); load(input.value); } }, input);
  
  async function load(query) {
    results.replaceChildren(skeletons(8));
    try {
      const res = await api.searchAnime(query);
      const items = (res.data?.animeList || []).map(toItem);
      results.replaceChildren(items.length ? h('ul', { class: 'grid' }, items.map(i => card(i))) : emptyState('Anime tidak ditemukan.'));
    } catch (e) {
      results.replaceChildren(errorState(e, () => load(query)));
    }
  }

  show('Jelajah', h('h1', {}, 'Jelajah Anime'), form, results);
  if (q) load(q); else results.replaceChildren(emptyState('Ketik judul untuk mencari anime.'));
});

// --- DETAIL ANIME ---
route('/anime/([^/]+)', async ({ params, signal }) => {
  show('Memuat...', h('p', { class: 'lede' }, 'Memuat detail anime...'));
  try {
    const res = await api.getAnimeDetail(params[0]);
    const details = res.data.details;
    const it = toItem(details);
    const episodes = details.episodeList || [];
    
    const info = h('div', {},
      h('h1', {}, it.title),
      h('ul', { class: 'tags' }, (details.genreList || []).map(g => h('li', {}, g.title))),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Tipe'), h('dd', {}, details.type || '-'),
        h('dt', {}, 'Episode'), h('dd', {}, details.episodes || '-'),
        h('dt', {}, 'Status'), h('dd', {}, details.status || '-'),
        h('dt', {}, 'Skor'), h('dd', {}, details.score || '-'),
        h('dt', {}, 'Studio'), h('dd', {}, details.studios || '-')),
      h('h2', {}, 'Sinopsis'),
      h('p', { class: 'syn' }, details.synopsis || 'Sinopsis belum tersedia.'),
      h('h2', {}, 'Daftar Episode'),
      h('div', { class: 'episode-list' }, episodes.map(ep => 
        h('a', { href: `/watch/${ep.episodeId}`, 'data-link': '' }, ep.title)
      ))
    );

    show(it.title, h('article', { class: 'detail' },
      h('div', { class: 'side' }, poster(it.title, details.poster, true), favButton(it, 'inline')),
      info));
  } catch (e) {
    show('Gagal', errorState(e, () => location.reload()));
  }
});

// --- WATCH PAGE (Pemutar Video) ---
route('/watch/([^/]+)', async ({ params, signal }) => {
  show('Memuat Pemutar...', h('p', { class: 'lede' }, 'Menyiapkan video...'));
  try {
    const res = await api.getEpisodeDetail(params[0]);
    const ep = res.data.details;
    
    const videoContainer = h('div', { class: 'video-container' });
    const serverList = h('div', { class: 'server-list' });

    // Fungsi untuk memuat video dari server
    const loadServer = async (serverId, btn) => {
      serverList.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      videoContainer.replaceChildren(h('p', { style: 'color: white; text-align: center; padding-top: 20%;' }, 'Memuat video...'));
      
      try {
        const serverRes = await api.getServerDetail(serverId);
        const url = serverRes.data.details.url;
        
        // Jika URL berupa iframe (mengandung <iframe), kita ekstrak src-nya
        if (url.includes('<iframe')) {
          const match = url.match(/src="([^"]+)"/);
          const src = match ? match[1] : url;
          videoContainer.replaceChildren(h('iframe', { src, allowfullscreen: true, frameborder: '0' }));
        } else {
          // Jika URL langsung (mp4/m3u8), gunakan tag video
          videoContainer.replaceChildren(h('video', { src: url, controls: true, autoplay: true, playsinline: true }));
        }
      } catch (e) {
        videoContainer.replaceChildren(h('p', { style: 'color: red; text-align: center; padding-top: 20%;' }, 'Gagal memuat server ini. Coba server lain.'));
      }
    };

    // Render daftar server
    if (ep.server && ep.server.qualityList) {
      ep.server.qualityList.forEach(quality => {
        quality.serverList.forEach(server => {
          const btn = h('button', { type: 'button' }, server.title);
          btn.addEventListener('click', () => loadServer(server.serverId, btn));
          serverList.append(btn);
        });
      });
    }

    // Muat default streaming URL jika ada
    if (ep.defaultStreamingUrl) {
      const match = ep.defaultStreamingUrl.match(/src="([^"]+)"/);
      const src = match ? match[1] : ep.defaultStreamingUrl;
      videoContainer.replaceChildren(h('iframe', { src, allowfullscreen: true, frameborder: '0' }));
    } else if (serverList.children.length > 0) {
      // Jika tidak ada default, klik server pertama
      serverList.children[0].click();
    } else {
      videoContainer.replaceChildren(h('p', { style: 'color: white; text-align: center; padding-top: 20%;' }, 'Tidak ada server video tersedia.'));
    }

    // Navigasi Prev/Next
    const nav = h('div', { class: 'pager' },
      ep.hasPrevEpisode ? h('a', { href: `/watch/${ep.prevEpisode.episodeId}`, 'data-link': '', class: 'btn' }, '← Sebelumnya') : null,
      h('a', { href: `/anime/${ep.animeId}`, 'data-link': '', class: 'btn primary' }, 'Daftar Episode'),
      ep.hasNextEpisode ? h('a', { href: `/watch/${ep.nextEpisode.episodeId}`, 'data-link': '', class: 'btn' }, 'Selanjutnya →') : null
    );

    show(ep.title, 
      videoContainer,
      h('h1', { style: 'font-size: 1.5rem; margin-top: 1rem;' }, ep.title),
      h('p', { class: 'meta' }, `Anime: ${ep.info?.credit || ''} • Durasi: ${ep.info?.duration || ''}`),
      h('h3', { style: 'margin-top: 1.5rem;' }, 'Pilih Server'),
      serverList,
      nav
    );

  } catch (e) {
    show('Gagal Memuat Video', errorState(e, () => location.reload()));
  }
});

// --- KOLEKSI ---
function renderFavorites() {
  const favs = readFavorites();
  const watch = readWatch();
  show('Koleksi', h('h1', {}, 'Koleksi Saya'),
    h('h2', {}, 'Favorit'),
    favs.length ? h('ul', { class: 'grid' }, favs.map(f => card(f))) : emptyState('Belum ada favorit.', browseLink()),
    h('h2', {}, 'Daftar Tontonan'),
    watch.length ? h('ul', { class: 'grid' }, watch.map(w => card(w, h('p', { class: 'meta', style: 'color: var(--teal);' }, `${WATCH_STATUSES[w.status]} • Eps ${w.episode}${w.total ? ` / ${w.total}` : ''}`))))) : emptyState('Belum ada daftar tontonan.'));
}
route('/favorites', renderFavorites);

// --- DEVELOPER ---
function renderDeveloper() {
  show('Developer', h('section', { class: 'dev' },
    h('img', { class: 'avatar', src: '/img/xs0ciety.png', width: 160, height: 160, alt: 'xs0cietyHUB', onerror: (e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="%231d2040"/></svg>'; } }),
    h('div', {},
      h('h1', {}, 'xs0cietyHUB'),
      h('p', { class: 'lede', style: 'margin-bottom: 1.5rem;' }, 'Developer independen di balik Kakemono. Punya saran atau laporan bug? Hubungi saya.'),
      h('ul', { class: 'social' }, SOCIALS.map(s => h('li', {}, h('a', { href: s.href, target: '_blank', rel: 'noopener noreferrer' }, icon(s.icon), h('span', {}, s.label), h('span', { class: 'handle' }, s.handle))))))));
}
route('/developer', renderDeveloper);

// --- 404 ---
function notFound() {
  show('404', h('div', { class: 'state' }, h('p', { class: 'nf' }, '404'), h('p', {}, 'Halaman tidak ditemukan.'), h('a', { class: 'btn primary', href: '/', 'data-link': '' }, 'Kembali')));
}
onNotFound(notFound);

// --- TABS ---
document.getElementById('tabbar').replaceChildren(...TABS.map(t => h('a', { href: t.href, 'data-link': '' }, icon(t.icon), h('span', {}, t.label))));

start();