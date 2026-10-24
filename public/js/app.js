import { register, setNotFound, start, navigate } from './router.js';
import { getHome, searchAnime, getAnimeDetail } from './api.js';
import { mountPlayer } from './player.js';
import { loadCollection, addToCollection, removeFromCollection, isInCollection } from './storage.js';
import { el, clear, animeCard, posterImage, skeletonGrid, emptyState, errorState, sectionHead } from './components.js';

const view = document.getElementById('view');

function setActiveNav(route) {
  document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
}

/* HOME */
register('/', async ({ signal }) => {
  setActiveNav('home');
  clear(view);
  view.append(el('h1', {}, 'Beranda'));
  const container = el('div');
  view.append(container);

  const skel = el('div', { class: 'grid' }, skeletonGrid(6));
  container.append(skel);

  try {
    const data = await getHome({ signal });
    if (signal.aborted) return;
    clear(container);
    for (const { title, list } of data.sections) {
      const section = el('section', { class: 'section' });
      section.append(sectionHead(title), el('div', { class: 'grid' }, ...list.map(animeCard)));
      container.append(section);
    }
    if (data.sections.length === 0) {
      container.append(emptyState('Belum ada data', 'Sumber tidak mengembalikan daftar anime.'));
    }
  } catch (err) {
    if (signal.aborted) return;
    clear(container);
    container.append(errorState('Gagal memuat beranda', err.message, () => navigate('/', { replace: true })));
  }
});

/* SEARCH */
register('/search', async ({ search, signal: routeSignal }) => {
  setActiveNav('search');
  clear(view);
  view.append(el('h1', {}, 'Pencarian'));

  const bar = el('div', { class: 'search-bar' });
  const input = el('input', { type: 'search', class: 'search-input', placeholder: 'Cari judul anime…', value: search.get('q') || '' });
  bar.append(input);
  const results = el('div');
  view.append(bar, results);

  let timer = null;
  let inflight = null;
  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    if (inflight) inflight.abort();
    const q = input.value.trim();
    if (!q) return clear(results);

    timer = setTimeout(async () => {
      if (routeSignal.aborted) return;
      inflight = new AbortController();
      const signal = AbortSignal.any([routeSignal, inflight.signal]);
      clear(results);
      results.append(el('div', { class: 'grid' }, skeletonGrid(6)));
      try {
        const data = await searchAnime(q, { signal });
        if (signal.aborted) return;
        clear(results);
        if (data.animeList.length === 0) results.append(emptyState('Tidak ditemukan', `Tidak ada hasil untuk "${q}".`));
        else results.append(el('div', { class: 'grid' }, ...data.animeList.map(animeCard)));
      } catch (err) {
        if (signal.aborted) return;
        clear(results);
        results.append(errorState('Pencarian gagal', err.message, () => input.dispatchEvent(new Event('input'))));
      }
    }, 400);
  });

  if (search.get('q')) input.dispatchEvent(new Event('input'));
});

/* DETAIL */
register('/anime/:id', async ({ params, signal }) => {
  setActiveNav('');
  clear(view);
  view.append(el('div', { class: 'state' }, 'Memuat detail…'));

  try {
    const data = await getAnimeDetail(params.id, { signal });
    if (signal.aborted) return;
    clear(view);
    const wrap = el('div', { class: 'detail' });
    
    const left = el('div', { class: 'detail-poster' });
    left.append(posterImage(data.poster, data.title, { eager: true }));
    
    const right = el('div', { class: 'detail-info' }, el('h1', {}, data.title));
    if (data.info.status) right.append(el('div', { class: 'detail-meta' }, el('span', { class: 'tag' }, data.info.status)));
    if (data.synopsis) right.append(el('p', { class: 'synopsis' }, data.synopsis));

    let inCol = isInCollection(params.id);
    const favBtn = el('button', { type: 'button', class: inCol ? 'btn' : 'btn btn-primary' }, inCol ? 'Hapus Koleksi' : 'Tambah Koleksi');
    favBtn.addEventListener('click', () => {
      if (isInCollection(params.id)) removeFromCollection(params.id);
      else addToCollection({ animeId: params.id, title: data.title, poster: data.poster });
      inCol = isInCollection(params.id);
      favBtn.textContent = inCol ? 'Hapus Koleksi' : 'Tambah Koleksi';
      favBtn.className = inCol ? 'btn' : 'btn btn-primary';
    });
    right.append(el('div', { class: 'detail-actions' }, favBtn));

    if (data.episodeList.length > 0) {
      const list = el('ul', { class: 'episode-list' });
      data.episodeList.forEach(ep => {
        list.append(el('li', { class: 'episode-item' }, el('a', { href: `/watch/${encodeURIComponent(ep.episodeId)}`, 'data-link': '' }, ep.title)));
      });
      right.append(el('h2', {}, 'Episode'), list);
    } else {
      right.append(emptyState('Belum ada episode', 'Sumber belum mencantumkan episode untuk anime ini.'));
    }

    wrap.append(left, right);
    view.append(wrap);
  } catch (err) {
    if (signal.aborted) return;
    clear(view);
    view.append(errorState('Gagal memuat detail', err.message, () => navigate(`/anime/${params.id}`, { replace: true })));
  }
});

/* WATCH */
register('/watch/:id', async ({ params, signal }) => {
  setActiveNav('');
  clear(view);
  const head = el('div', { class: 'watch-head' }, el('a', { href: '/', class: 'btn btn-ghost', 'data-link': '' }, '← Kembali'), el('h1', {}, 'Menonton'));
  const playerBox = el('div', { class: 'player-wrap' });
  const serverBar = el('div', { class: 'server-bar' });
  const nav = el('div', { class: 'watch-nav' });
  view.append(head, playerBox, serverBar, nav);

  await mountPlayer(playerBox, params.id, {
    signal,
    serverBar,
    onMeta: (ep) => {
      head.replaceChildren(el('a', { href: ep.animeId ? `/anime/${encodeURIComponent(ep.animeId)}` : '/', class: 'btn btn-ghost', 'data-link': '' }, '← Kembali'), el('h1', {}, ep.title || 'Menonton'));
      clear(nav);
      if (ep.prevEpisode) nav.append(el('a', { href: `/watch/${encodeURIComponent(ep.prevEpisode.episodeId)}`, class: 'btn btn-ghost', 'data-link': '' }, '← Sebelumnya'));
      if (ep.nextEpisode) nav.append(el('a', { href: `/watch/${encodeURIComponent(ep.nextEpisode.episodeId)}`, class: 'btn btn-primary', 'data-link': '' }, 'Selanjutnya →'));
    }
  });
});

/* COLLECTION */
register('/collection', async () => {
  setActiveNav('collection');
  clear(view);
  view.append(el('h1', {}, 'Koleksi'));
  const items = loadCollection();
  if (items.length === 0) {
    view.append(emptyState('Koleksi kosong', 'Tambahkan anime dari halaman detail.'));
    return;
  }
  const grid = el('div', { class: 'grid' });
  items.forEach(item => {
    const wrap = el('div', { class: 'collection-card' });
    wrap.append(animeCard(item));
    const rm = el('button', { class: 'remove-btn', title: 'Hapus' }, '×');
    rm.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      removeFromCollection(item.animeId);
      wrap.remove();
      if (grid.children.length === 0) navigate('/collection', { replace: true });
    });
    wrap.append(rm);
    grid.append(wrap);
  });
  view.append(grid);
});

/* DEVELOPER */
register('/developer', async () => {
  setActiveNav('developer');
  clear(view);
  const profile = el('section', { class: 'profile' });
  
  const avatar = el('img', { class: 'avatar', src: '/img/xs0ciety.png', alt: 'xs0cietyHUB' });
  avatar.addEventListener('error', () => avatar.replaceWith(el('div', { class: 'avatar-fallback' }, 'x0')), { once: true });
  profile.append(avatar, el('h1', { class: 'profile-name' }, 'xs0cietyHUB'), el('p', { class: 'profile-alias' }, 'alias: xs0ciety505'));

  const social = el('ul', { class: 'social-list' });
  const links = [
    { href: 'https://www.tiktok.com/@xprimesociety', label: 'TikTok', handle: '@xprimesociety' },
    { href: 'https://www.instagram.com/xs0ciety-hub', label: 'Instagram', handle: '@xs0ciety-hub' },
    { href: 'https://t.me/xs0cietyHUB', label: 'Telegram', handle: '@xs0cietyHUB' }
  ];
  links.forEach(l => {
    social.append(el('li', {}, el('a', { href: l.href, target: '_blank', rel: 'noopener noreferrer', class: 'social-link' }, el('div', {}, el('div', { class: 'social-label' }, l.label), el('div', { class: 'social-handle' }, l.handle)))));
  });

  profile.append(social, el('p', { class: 'copyright' }, '© 2026 xs0cietyHUB — xs0ciety505'));
  view.append(profile);
});

setNotFound(async () => {
  setActiveNav('');
  clear(view);
  view.append(emptyState('404', 'Halaman tidak ditemukan.'));
});

start();