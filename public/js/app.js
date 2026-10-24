import { register, setNotFound, start, navigate } from './router.js';
import { getHome, searchAnime, getAnimeDetail } from './api.js';
import { mountPlayer, switchServer } from './player.js';
import {
  loadCollection,
  addToCollection,
  removeFromCollection,
  isInCollection,
} from './storage.js';
import {
  el,
  clear,
  animeCard,
  skeletonGrid,
  emptyState,
  errorState,
  sectionHead,
} from './components.js';

const view = document.getElementById('view');
const SITE_URL = location.origin;

function setMeta({ title, description, canonical }) {
  document.title = title;
  const setAttr = (sel, attr, val) => {
    if (!val) return;
    const node = document.querySelector(sel);
    if (node) node.setAttribute(attr, val);
  };
  setAttr('meta[name="description"]', 'content', description);
  setAttr('meta[property="og:title"]', 'content', title);
  setAttr('meta[property="og:description"]', 'content', description);
  setAttr('meta[property="og:url"]', 'content', canonical);
  setAttr('meta[name="twitter:title"]', 'content', title);
  setAttr('meta[name="twitter:description"]', 'content', description);
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  if (canonical) link.href = canonical;
}

function setActiveNav(route) {
  document.querySelectorAll('[data-route]').forEach((a) => {
    if (a.dataset.route === route) a.classList.add('active');
    else a.classList.remove('active');
  });
}

function updateJsonLd(data) {
  const id = 'dynamic-jsonld';
  let s = document.getElementById(id);
  if (!data) {
    if (s) s.remove();
    return;
  }
  if (!s) {
    s = document.createElement('script');
    s.id = id;
    s.type = 'application/ld+json';
    document.head.appendChild(s);
  }
  s.textContent = JSON.stringify(data);
}

/* ---------- HOME ---------- */
register('/', async () => {
  setActiveNav('home');
  updateJsonLd(null);
  setMeta({
    title: 'xs0cietyHUB — Anime Streaming',
    description: 'Jelajahi anime ongoing dan complete di xs0cietyHUB.',
    canonical: `${SITE_URL}/`,
  });
  clear(view);
  view.append(el('h1', {}, 'Beranda'));
  const container = el('div');
  view.append(container);
  await loadHome(container);
});

async function loadHome(container) {
  clear(container);
  const frag = document.createDocumentFragment();
  const skel1 = el('section', { class: 'section' });
  skel1.append(sectionHead('Sedang Tayang'), el('div', { class: 'grid' }, skeletonGrid(6)));
  const skel2 = el('section', { class: 'section' });
  skel2.append(sectionHead('Selesai'), el('div', { class: 'grid' }, skeletonGrid(6)));
  frag.append(skel1, skel2);
  container.append(frag);

  try {
    const data = await getHome();
    clear(container);
    if (data.ongoing.length === 0 && data.complete.length === 0) {
      container.append(
        emptyState('Belum ada data', 'API tidak mengembalikan daftar anime saat ini.')
      );
      return;
    }
    if (data.ongoing.length > 0) {
      const s = el('section', { class: 'section' });
      s.append(sectionHead('Sedang Tayang'));
      const grid = el('div', { class: 'grid' });
      data.ongoing.forEach((a) => grid.append(animeCard(a)));
      s.append(grid);
      container.append(s);
    }
    if (data.complete.length > 0) {
      const s = el('section', { class: 'section' });
      s.append(sectionHead('Selesai'));
      const grid = el('div', { class: 'grid' });
      data.complete.forEach((a) => grid.append(animeCard(a)));
      s.append(grid);
      container.append(s);
    }
  } catch (err) {
    clear(container);
    container.append(
      errorState(
        'Gagal memuat beranda',
        err.name === 'AbortError' ? 'Permintaan dibatalkan.' : err.message || 'Coba lagi.',
        () => loadHome(container)
      )
    );
  }
}

/* ---------- SEARCH ---------- */
register('/search', async ({ search }) => {
  setActiveNav('search');
  updateJsonLd(null);
  const initialQ = search.get('q') || '';
  setMeta({
    title: initialQ ? `Cari "${initialQ}" — xs0cietyHUB` : 'Pencarian — xs0cietyHUB',
    description: 'Cari anime berdasarkan judul di xs0cietyHUB.',
    canonical: `${SITE_URL}/search${initialQ ? `?q=${encodeURIComponent(initialQ)}` : ''}`,
  });
  clear(view);
  view.append(el('h1', {}, 'Pencarian'));

  const bar = el('div', { class: 'search-bar' });
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('class', 'search-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', '11'); circle.setAttribute('cy', '11'); circle.setAttribute('r', '7');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'm20 20-3.5-3.5');
  icon.append(circle, path);

  const input = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Cari judul anime…',
    'aria-label': 'Cari judul anime',
    maxlength: 60,
    value: initialQ,
    autocomplete: 'off',
  });
  bar.append(icon, input);

  const results = el('div');
  view.append(bar, results);

  let controller = null;
  let timer = null;
  let lastQ = '';

  function runSearch(q) {
    if (q === lastQ) return;
    lastQ = q;
    if (controller) controller.abort();
    controller = new AbortController();
    clear(results);

    if (!q) {
      results.append(emptyState('Mulai mencari', 'Ketik judul anime untuk mulai mencari.'));
      if (location.search !== '') history.replaceState({}, '', '/search');
      return;
    }

    const url = `/search?q=${encodeURIComponent(q)}`;
    if (location.pathname + location.search !== url) history.replaceState({}, '', url);

    results.append(el('div', { class: 'grid' }, skeletonGrid(8)));

    searchAnime(q, { signal: controller.signal })
      .then((data) => {
        if (q !== lastQ) return;
        clear(results);
        if (!data.animeList || data.animeList.length === 0) {
          results.append(emptyState('Tidak ditemukan', `Tidak ada anime untuk "${q}".`));
          return;
        }
        const grid = el('div', { class: 'grid' });
        data.animeList.forEach((a) => grid.append(animeCard(a)));
        results.append(grid);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (q !== lastQ) return;
        clear(results);
        results.append(
          errorState('Pencarian gagal', err.message || 'Coba lagi.', () => {
            lastQ = '';
            runSearch(q);
          })
        );
      });
  }

  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value.trim().slice(0, 60)), 350);
  });

  if (initialQ) runSearch(initialQ);
  else results.append(emptyState('Mulai mencari', 'Ketik judul anime untuk mulai mencari.'));

  setTimeout(() => input.focus({ preventScroll: true }), 50);

  return () => {
    if (controller) controller.abort();
    if (timer) clearTimeout(timer);
  };
});

/* ---------- ANIME DETAIL ---------- */
register('/anime/:id', async ({ params }) => {
  setActiveNav('');
  const id = params.id;
  clear(view);
  view.append(el('div', { class: 'state' }, el('p', {}, 'Memuat detail…')));

  try {
    const data = await getAnimeDetail(id);
    clear(view);
    setMeta({
      title: `${data.title} — xs0cietyHUB`,
      description: data.synopsis ? data.synopsis.slice(0, 160) : `Detail anime ${data.title}.`,
      canonical: `${SITE_URL}/anime/${encodeURIComponent(id)}`,
    });
    if (data.poster) {
      const og = document.querySelector('meta[property="og:image"]');
      if (og) og.setAttribute('content', data.poster);
    }
    updateJsonLd({
      '@context': 'https://schema.org',
      '@type': 'TVSeries',
      name: data.title,
      image: data.poster || undefined,
      description: data.synopsis || undefined,
      author: { '@type': 'Person', name: 'xs0cietyHUB/xs0ciety505' },
    });

    const wrap = el('div', { class: 'detail' });
    const left = el('div');
    const posterBox = el('div', { class: 'detail-poster' });
    if (data.poster) {
      posterBox.append(
        el('img', {
          src: data.poster,
          alt: `Poster ${data.title}`,
          referrerpolicy: 'no-referrer',
          width: 300,
          height: 400,
        })
      );
    }
    left.append(posterBox);
    wrap.append(left);

    const right = el('div', { class: 'detail-info' });
    right.append(el('h1', {}, data.title));

    const meta = el('div', { class: 'detail-meta' });
    ['status', 'skor', 'tipe', 'totalEpisode', 'durasi', 'studio'].forEach((k) => {
      if (data.info[k]) meta.append(el('span', { class: 'tag' }, `${k}: ${data.info[k]}`));
    });
    right.append(meta);

    if (data.info.genre && data.info.genre.length) {
      const g = el('div', { class: 'detail-meta' });
      data.info.genre.forEach((name) => g.append(el('span', { class: 'tag' }, name)));
      right.append(g);
    }

    if (data.synopsis) right.append(el('p', { class: 'synopsis' }, data.synopsis));

    const actions = el('div', { class: 'detail-actions' });
    let inCol = isInCollection(id);
    const favBtn = el(
      'button',
      { type: 'button', class: inCol ? 'btn' : 'btn btn-primary' },
      inCol ? 'Hapus dari Koleksi' : 'Tambah ke Koleksi'
    );
    favBtn.addEventListener('click', () => {
      if (isInCollection(id)) removeFromCollection(id);
      else addToCollection({ animeId: id, title: data.title, poster: data.poster || null });
      inCol = isInCollection(id);
      favBtn.textContent = inCol ? 'Hapus dari Koleksi' : 'Tambah ke Koleksi';
      favBtn.className = inCol ? 'btn' : 'btn btn-primary';
    });
    actions.append(favBtn);
    right.append(actions);

    if (data.episodeList.length > 0) {
      const head = el('div', { class: 'episodes-head' }, el('h2', {}, 'Episode'));
      const list = el('ul', { class: 'episode-list' });
      data.episodeList.forEach((ep) => {
        const li = el('li', { class: 'episode-item' });
        li.append(
          el(
            'a',
            { href: `/watch/${encodeURIComponent(ep.episodeId)}`, 'data-link': '' },
            ep.title
          )
        );
        list.append(li);
      });
      right.append(head, list);
    } else {
      right.append(el('p', {}, 'Belum ada episode yang tersedia dari API.'));
    }

    wrap.append(right);
    view.append(wrap);
  } catch (err) {
    clear(view);
    view.append(
      errorState(
        'Gagal memuat detail anime',
        err.message || 'Coba lagi.',
        () => navigate(`/anime/${encodeURIComponent(id)}`, { replace: true })
      )
    );
  }
});

/* ---------- WATCH ---------- */
register('/watch/:episodeId', async ({ params }) => {
  setActiveNav('');
  updateJsonLd(null);
  const episodeId = params.episodeId;
  clear(view);

  const head = el(
    'div',
    { class: 'watch-head' },
    el('a', { href: '/', class: 'btn btn-ghost', 'data-link': '' }, '← Kembali'),
    el('h1', {}, 'Menonton')
  );
  const playerBox = el('div', { class: 'player-wrap' });
  const nav = el('div', { class: 'watch-nav' });
  const serverBox = el('div', { class: 'server-list' });
  view.append(head, playerBox, nav, serverBox);

  const onMeta = (ep) => {
    setMeta({
      title: `${ep.title || 'Episode'} — xs0cietyHUB`,
      description: `Tonton ${ep.title || 'episode'} di xs0cietyHUB.`,
      canonical: `${SITE_URL}/watch/${encodeURIComponent(episodeId)}`,
    });
    head.replaceChildren(
      el(
        'a',
        {
          href: ep.animeId ? `/anime/${encodeURIComponent(ep.animeId)}` : '/',
          class: 'btn btn-ghost',
          'data-link': '',
        },
        '← Kembali'
      ),
      el('h1', {}, ep.title || 'Menonton')
    );
    clear(nav);
    if (ep.prevEpisode) {
      nav.append(
        el(
          'a',
          {
            href: `/watch/${encodeURIComponent(ep.prevEpisode.episodeId)}`,
            class: 'btn btn-ghost',
            'data-link': '',
          },
          `← ${ep.prevEpisode.title || 'Sebelumnya'}`
        )
      );
    }
    if (ep.nextEpisode) {
      nav.append(
        el(
          'a',
          {
            href: `/watch/${encodeURIComponent(ep.nextEpisode.episodeId)}`,
            class: 'btn btn-primary',
            'data-link': '',
          },
          `${ep.nextEpisode.title || 'Selanjutnya'} →`
        )
      );
    }
    clear(serverBox);
    if (ep.server && ep.server.length > 0) {
      serverBox.append(el('span', { class: 'tag' }, 'Server:'));
      ep.server.forEach((s, idx) => {
        const b = el(
          'button',
          { type: 'button', class: idx === 0 ? 'server-btn active' : 'server-btn' },
          s.title || `Server ${idx + 1}`
        );
        b.addEventListener('click', async () => {
          serverBox.querySelectorAll('.server-btn').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          await switchServer(playerBox, s.serverId);
        });
        serverBox.append(b);
      });
    }
  };

  await mountPlayer(playerBox, episodeId, { onMeta });
});

/* ---------- COLLECTION ---------- */
register('/collection', async () => {
  setActiveNav('collection');
  updateJsonLd(null);
  setMeta({
    title: 'Koleksi — xs0cietyHUB',
    description: 'Koleksi anime yang Anda simpan di perangkat ini.',
    canonical: `${SITE_URL}/collection`,
  });
  clear(view);
  view.append(el('h1', {}, 'Koleksi'));
  view.append(
    el(
      'p',
      { class: 'state-msg' },
      'Koleksi hanya tersimpan di browser ini dan tidak tersinkronisasi antarperangkat.'
    )
  );

  const items = loadCollection();
  if (items.length === 0) {
    view.append(
      emptyState('Koleksi masih kosong', 'Tambahkan anime dari halaman detail.', {
        action: 'Jelajahi anime',
        onAction: () => navigate('/'),
      })
    );
    return;
  }

  const grid = el('div', { class: 'grid' });
  items.forEach((item) => {
    const wrap = el('div', { class: 'collection-card' });
    wrap.append(animeCard(item));
    const rm = el(
      'button',
      {
        type: 'button',
        class: 'remove-btn',
        'aria-label': `Hapus ${item.title} dari koleksi`,
        title: 'Hapus',
      },
      '×'
    );
    rm.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFromCollection(item.animeId);
      wrap.remove();
      if (grid.children.length === 0) {
        clear(view);
        view.append(el('h1', {}, 'Koleksi'));
        view.append(emptyState('Koleksi kosong', 'Tidak ada anime lagi.'));
      }
    });
    wrap.append(rm);
    grid.append(wrap);
  });
  view.append(grid);
});

/* ---------- DEVELOPER ---------- */
register('/developer', async () => {
  setActiveNav('developer');
  updateJsonLd(null);
  setMeta({
    title: 'Developer — xs0cietyHUB',
    description: 'Profil developer xs0cietyHUB (xs0ciety505).',
    canonical: `${SITE_URL}/developer`,
  });
  clear(view);

  const profile = el('section', { class: 'profile' });

  const avatarImg = el('img', {
    class: 'avatar',
    src: '/img/xs0ciety.png',
    alt: 'Foto profil xs0cietyHUB',
    width: 140,
    height: 140,
    referrerpolicy: 'no-referrer',
    loading: 'eager',
    decoding: 'async',
  });
  const fallback = el('div', { class: 'avatar-fallback', 'aria-hidden': 'true' }, 'x0');
  avatarImg.addEventListener('error', () => avatarImg.replaceWith(fallback), { once: true });
  profile.append(avatarImg);

  profile.append(el('h1', { class: 'profile-name' }, 'xs0cietyHUB'));
  profile.append(el('p', { class: 'profile-alias' }, 'alias: xs0ciety505'));

  const social = el('ul', { class: 'social-list' });
  const NS = 'http://www.w3.org/2000/svg';

  function socialItem(href, label, handle, pathData) {
    const a = el('a', {
      class: 'social-link',
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    const icon = document.createElementNS(NS, 'svg');
    icon.setAttribute('class', 'social-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('fill', 'currentColor');
    p.setAttribute('d', pathData);
    icon.append(p);
    const text = el('div');
    text.append(el('div', { class: 'social-label' }, label));
    text.append(el('div', { class: 'social-handle' }, handle));
    a.append(icon, text);
    return el('li', {}, a);
  }

  social.append(
    socialItem(
      'https://www.tiktok.com/@xprimesociety',
      'TikTok',
      '@xprimesociety',
      'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.79a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.22z'
    )
  );
  social.append(
    socialItem(
      'https://www.instagram.com/xs0ciety-hub',
      'Instagram',
      '@xs0ciety-hub',
      'M12 2c2.72 0 3.06.01 4.12.06 1.07.05 1.79.22 2.43.47.66.25 1.22.6 1.77 1.15.55.55.9 1.11 1.15 1.77.25.64.42 1.36.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.07-.22 1.79-.47 2.43-.25.66-.6 1.22-1.15 1.77-.55.55-1.11.9-1.77 1.15-.64.25-1.36.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.07-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.77-1.15 4.9 4.9 0 0 1-1.15-1.77c-.25-.64-.42-1.36-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.07.22-1.79.47-2.43.25-.66.6-1.22 1.15-1.77.55-.55 1.11-.9 1.77-1.15.64-.25 1.36-.42 2.43-.47C8.94 2.01 9.28 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.25A3.25 3.25 0 1 1 15.25 12 3.25 3.25 0 0 1 12 15.25zM17.5 5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z'
    )
  );
  social.append(
    socialItem(
      'https://t.me/xs0cietyHUB',
      'Telegram',
      '@xs0cietyHUB',
      'M21.94 4.3 2.84 11.68c-1.3.53-1.29 1.25-.24 1.58l4.9 1.53 1.9 5.82c.23.63.12.88.78.88.5 0 .72-.23 1-.5l2.4-2.34 4.98 3.68c.92.5 1.57.24 1.8-.85l3.26-15.35c.33-1.32-.5-1.92-1.68-1.43z'
    )
  );

  profile.append(social);
  profile.append(el('p', { class: 'copyright' }, '© 2026 xs0cietyHUB — xs0ciety505'));
  view.append(profile);
});

/* ---------- NOT FOUND ---------- */
setNotFound(async ({ pathname }) => {
  setActiveNav('');
  updateJsonLd(null);
  document.title = 'Halaman tidak ditemukan — xs0cietyHUB';
  clear(view);
  view.append(
    emptyState('Halaman tidak ditemukan', `URL "${pathname}" tidak tersedia.`, {
      action: 'Ke beranda',
      onAction: () => navigate('/'),
    })
  );
});

start();