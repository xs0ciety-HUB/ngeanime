import { h, poster, toast } from './dom.js';
import * as api from './api.js';
import {
  readFavorites, isFavorite, toggleFavorite,
  readWatch, getWatch, setWatch, removeWatch, WATCH_STATUSES,
} from './store.js';
import { route, onNotFound, start } from './router.js';

const main = document.getElementById('main');
const TYPES = ['tv', 'movie', 'ova', 'special', 'ona', 'music'];
const STATUSES = { airing: 'Sedang tayang', complete: 'Selesai', upcoming: 'Akan tayang' };
const SVG_NS = 'http://www.w3.org/2000/svg';

// Semua ikon: garis (stroke) 24x24, ukuran dan ketebalan sama.
const ICON = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h5v-6h4v6h5V10'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4.2-4.2'],
  bookmark: ['M6 3h12v18l-6-4.5L6 21z'],
  code: ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13.5 5l-3 14'],
  instagram: [
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z',
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M17.5 6.5h.01',
  ],
  telegram: ['M21 4L3 11l6 2.2L11.5 20l3.2-3.6 4.3 3.1z', 'M9 13.2L17 7'],
  tiktok: ['M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5', 'M14 3c.4 2.6 2.2 4.2 5 4.5'],
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
  { icon: 'telegram', label: 'Telegram', handle: '@xs0cietyHUB', href: 'https://t.me/xs0cietyHUB' },
];

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '22');
  svg.setAttribute('height', '22');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'ico');
  for (const d of ICON[name]) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function show(title, ...nodes) {
  document.title = title ? `${title} — Kakemono` : 'Kakemono — temukan anime';
  main.replaceChildren(...nodes.flat().filter(Boolean));
  document.querySelectorAll('#tabbar a').forEach(a => {
    if (a.pathname === location.pathname) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  main.focus({ preventScroll: true });
  scrollTo(0, 0);
}

const MESSAGES = {
  network: 'Tidak bisa terhubung. Periksa koneksi internetmu lalu coba lagi.',
  rate: 'Terlalu banyak permintaan ke Jikan. Tunggu sekitar satu menit, lalu coba lagi.',
  server: 'Server data anime sedang bermasalah. Coba lagi sebentar lagi.',
  data: 'Data dari server tidak bisa dibaca. Coba lagi nanti.',
};

function errorState(err, retry) {
  console.error('Load failed:', err.kind || 'app', err.message);
  return h('div', { class: 'state', role: 'alert' },
    h('p', {}, MESSAGES[err.kind] || 'Terjadi kesalahan. Muat ulang halaman.'),
    retry ? h('button', { class: 'btn', type: 'button', onclick: retry }, 'Coba lagi') : null);
}

const emptyState = (text, link) => h('div', { class: 'state' }, h('p', {}, text), link);
const skeletons = n => h('ul', { class: 'grid', 'aria-hidden': 'true' },
  Array.from({ length: n }, () => h('li', { class: 'sk' })));
const browseLink = () => h('a', { class: 'btn primary', href: '/browse', 'data-link': '' }, 'Cari anime');

function favButton(item, cls = '') {
  const saved = isFavorite(item.id);
  const btn = h('button', { class: `fav ${cls}`.trim(), type: 'button', 'aria-pressed': String(saved) },
    saved ? 'Tersimpan' : 'Simpan');
  btn.setAttribute('aria-label', `Favorit: ${item.title}`);
  btn.addEventListener('click', () => {
    const r = toggleFavorite(item);
    const nowSaved = isFavorite(item.id);
    btn.setAttribute('aria-pressed', String(nowSaved));
    btn.textContent = nowSaved ? 'Tersimpan' : 'Simpan';
    toast(!r.ok ? 'Penyimpanan browser gagal. Favorit tidak tersimpan.'
      : nowSaved ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
    if (location.pathname === '/favorites' && !nowSaved) renderFavorites();
  });
  return btn;
}

function card(item, extra = null) {
  const sub = [item.type, item.year].filter(Boolean).join(', ');
  return h('li', { class: 'card' },
    h('a', { href: `/anime/${item.id}`, 'data-link': '' },
      poster(item.title, item.image),
      h('h3', {}, item.title),
      h('div', { class: 'meta' }, sub, item.score ? [' ', h('span', { class: 'score' }, item.score.toFixed(1))] : null)),
    extra,
    favButton(item));
}

const toItem = a => ({
  id: Number.isInteger(a?.mal_id) ? a.mal_id : null,
  title: String(a?.title_english || a?.title || 'Tanpa judul'),
  image: a?.images?.webp?.image_url ?? a?.images?.jpg?.image_url ?? null,
  type: typeof a?.type === 'string' ? a.type : '',
  year: Number.isInteger(a?.year) ? a.year : null,
  score: typeof a?.score === 'number' ? a.score : null,
});
const toItems = list => (Array.isArray(list) ? list : []).map(toItem).filter(i => i.id);

// Tidak memuat saat dibuat. Panggil run() untuk memuat. run() tidak pernah melempar error.
function section(title, loader, signal, limit = 12) {
  const body = h('div', {}, skeletons(6));
  const run = async () => {
    body.replaceChildren(skeletons(6));
    try {
      const items = toItems((await loader(signal)).data).slice(0, limit);
      body.replaceChildren(items.length
        ? h('ul', { class: 'grid' }, items.map(i => card(i)))
        : emptyState('Belum ada data untuk bagian ini.'));
      return items;
    } catch (e) {
      if (e.kind !== 'aborted') body.replaceChildren(errorState(e, run));
      return [];
    }
  };
  return { wrap: h('section', {}, h('h2', {}, title), body), run };
}

function safeLink(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

// ---------- beranda ----------
route('/', async ({ signal }) => {
  const feat = h('div', {});
  const popular = section('Paling populer', api.topAnime, signal);
  const season = section('Tayang musim ini', api.seasonNow, signal);
  show('', h('div', { class: 'hero' },
    h('div', {},
      h('h1', {}, 'Temukan anime berikutnya.'),
      h('p', { class: 'lede' }, 'Cari judul, jelajahi genre, catat progres tontonanmu. Semua data dari MyAnimeList.'),
      h('a', { class: 'btn primary', href: '/browse', 'data-link': '' }, 'Mulai jelajah')),
    feat),
    popular.wrap, season.wrap);

  const items = await popular.run();
  if (items[0]) {
    const f = items[0];
    feat.replaceChildren(h('a', { class: 'feat', href: `/anime/${f.id}`, 'data-link': '' },
      poster(f.title, f.image, true),
      h('div', {}, h('h3', {}, f.title),
        h('p', {}, `Paling populer saat ini${f.type ? ` · ${f.type.toUpperCase()}` : ''}.`))));
  }
  await season.run();
});

// ---------- jelajah ----------
function readParams(query) {
  const page = parseInt(query.get('page') || '1', 10);
  const genre = query.get('genre') || '';
  const type = query.get('type') || '';
  const status = query.get('status') || '';
  return {
    q: (query.get('q') || '').trim().slice(0, 100),
    genre: /^\d{1,4}$/.test(genre) ? genre : '',
    type: TYPES.includes(type) ? type : '',
    status: Object.hasOwn(STATUSES, status) ? status : '',
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

route('/browse|/search', ({ query, signal }) => browse(readParams(query), signal));

function browse(p, navSignal) {
  const results = h('div', {});
  let searchCtl = null;
  let timer = null;

  const q = h('input', {
    type: 'search', name: 'q', maxlength: 100, placeholder: 'Cari judul anime',
    'aria-label': 'Cari judul anime', value: p.q,
  });
  const genre = h('select', { 'aria-label': 'Genre' }, h('option', { value: '' }, 'Semua genre'));
  const type = h('select', { 'aria-label': 'Tipe' }, h('option', { value: '' }, 'Semua tipe'),
    TYPES.map(t => h('option', { value: t }, t.toUpperCase())));
  const status = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'Semua status'),
    Object.entries(STATUSES).map(([v, l]) => h('option', { value: v }, l)));
  type.value = p.type;
  status.value = p.status;

  const form = h('form', {
    class: 'bar', role: 'search',
    onsubmit: e => { e.preventDefault(); apply(1); },
  }, q, genre, type, status);

  const current = () => ({
    q: q.value.trim().slice(0, 100), genre: genre.value, type: type.value, status: status.value,
  });

  function apply(page) {
    clearTimeout(timer);
    const s = current();
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(s)) if (v) usp.set(k, v);
    if (page > 1) usp.set('page', String(page));
    const qs = usp.toString();
    history.replaceState(null, '', `/browse${qs ? `?${qs}` : ''}`);
    load({ ...s, page });
  }

  async function load(s) {
    searchCtl?.abort();
    const ctl = new AbortController();
    searchCtl = ctl;
    results.replaceChildren(skeletons(8));
    try {
      const res = await api.searchAnime({
        q: s.q, genres: s.genre, type: s.type, status: s.status, page: s.page,
        order_by: s.q ? undefined : 'popularity',
      }, ctl.signal);
      if (ctl.signal.aborted) return;
      const items = toItems(res.data);
      const pg = res.pagination || {};
      if (!items.length) {
        results.replaceChildren(emptyState(
          'Tidak ada anime yang cocok. Ubah kata kunci atau longgarkan filter.',
          h('button', {
            class: 'btn', type: 'button',
            onclick: () => { q.value = ''; genre.value = ''; type.value = ''; status.value = ''; apply(1); },
          }, 'Reset filter')));
        return;
      }
      results.replaceChildren(
        h('ul', { class: 'grid' }, items.map(i => card(i))),
        h('nav', { class: 'pager', 'aria-label': 'Halaman' },
          h('button', { class: 'btn', type: 'button', disabled: s.page <= 1, onclick: () => apply(s.page - 1) }, 'Sebelumnya'),
          h('span', {}, `Halaman ${s.page}${Number.isInteger(pg.last_visible_page) ? ` dari ${pg.last_visible_page}` : ''}`),
          h('button', { class: 'btn', type: 'button', disabled: !pg.has_next_page, onclick: () => apply(s.page + 1) }, 'Berikutnya')));
    } catch (e) {
      if (ctl.signal.aborted || e.kind === 'aborted') return;
      results.replaceChildren(errorState(e, () => load(s)));
    }
  }

  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => apply(1), 400);
  });
  [genre, type, status].forEach(el => el.addEventListener('change', () => apply(1)));
  navSignal.addEventListener('abort', () => { clearTimeout(timer); searchCtl?.abort(); }, { once: true });

  show('Jelajah', h('h1', {}, 'Jelajah anime'), form, results);

  api.genres(navSignal).then(list => {
    list.filter(g => Number.isInteger(g.mal_id) && typeof g.name === 'string')
      .forEach(g => genre.append(h('option', { value: g.mal_id }, g.name)));
    genre.value = p.genre;
  }).catch(e => {
    if (e.kind !== 'aborted') console.warn('Genre tidak tersedia', e.kind);
  });

  load(p);
}

// ---------- tontonan ----------
function watchPanel(item) {
  const box = h('div', { class: 'watch' });

  const render = () => {
    const rec = getWatch(item.id);
    const ep = rec?.episode ?? 0;
    const nextStatus = rec && rec.status !== 'planning' ? rec.status : 'watching';

    const save = (patch, msg) => {
      const r = setWatch(item, patch);
      if (!r.ok) toast('Penyimpanan browser gagal. Perubahan tidak tersimpan.');
      else if (msg) toast(msg);
      render();
    };

    const sel = h('select', { 'aria-label': 'Status tontonan' },
      h('option', { value: '' }, 'Belum di daftar tontonan'),
      Object.entries(WATCH_STATUSES).map(([v, l]) => h('option', { value: v }, l)));
    sel.value = rec?.status ?? '';
    sel.addEventListener('change', () => {
      if (!sel.value) {
        removeWatch(item.id);
        toast('Dihapus dari daftar tontonan');
        render();
      } else {
        save({ status: sel.value }, 'Status tontonan diperbarui');
      }
    });

    const minus = h('button', { class: 'btn', type: 'button', disabled: ep <= 0 }, '−1 episode');
    minus.addEventListener('click', () => save({ episode: ep - 1, status: nextStatus }, 'Progres disimpan'));

    const plus = h('button', {
      class: 'btn primary', type: 'button',
      disabled: item.total != null && ep >= item.total,
    }, '+1 episode');
    plus.addEventListener('click', () => save({ episode: ep + 1, status: nextStatus }, 'Progres disimpan'));

    const epIn = h('input', {
      type: 'number', min: '0', max: String(item.total ?? 9999), step: '1', inputmode: 'numeric',
      'aria-label': 'Episode terakhir yang ditonton', value: String(ep),
    });
    epIn.addEventListener('change', () => {
      const n = Math.trunc(Number(epIn.value));
      if (!Number.isFinite(n) || n < 0) {
        toast('Isi angka episode yang valid.');
        return render();
      }
      save({ episode: n, status: nextStatus }, 'Progres disimpan');
    });

    const prog = h('p', { class: 'prog' }, rec
      ? `${WATCH_STATUSES[rec.status]} · Episode ${rec.episode} dari ${item.total ?? '?'}`
      : 'Pilih status atau isi episode untuk mulai mencatat.');

    box.replaceChildren(
      h('h3', {}, 'Tontonanmu'),
      h('div', { class: 'row' }, sel),
      h('label', { class: 'row' }, 'Episode ', epIn),
      h('div', { class: 'row' }, minus, plus),
      prog);
  };

  render();
  return box;
}

// ---------- detail anime ----------
route('/anime/(\\d{1,7})', ({ params, signal }) => renderAnime(Number(params[0]), signal));

async function renderAnime(id, signal) {
  show('Memuat…', h('p', { class: 'lede' }, 'Memuat detail anime…'));

  let a;
  try {
    a = (await api.animeFull(id, signal)).data;
    if (!a || a.mal_id !== id) throw new api.ApiError('data', 'Data tidak cocok');
  } catch (e) {
    if (e.kind === 'aborted') return;
    if (e.kind === 'notfound') return notFound();
    show('Gagal memuat', errorState(e, () => renderAnime(id, signal)));
    return;
  }

  const it = toItem(a);
  const total = Number.isInteger(a.episodes) && a.episodes > 0 ? a.episodes : null;
  const names = key => (Array.isArray(a[key]) ? a[key] : []).map(x => x?.name).filter(n => typeof n === 'string');
  const facts = [
    ['Tipe', a.type],
    ['Episode', total ?? a.episodes],
    ['Status', a.status],
    ['Tayang', a.aired?.string],
    ['Studio', names('studios').join(', ')],
    ['Musim', a.season && a.year ? `${a.season} ${a.year}` : a.year],
    ['Skor', a.score ? `${a.score.toFixed(2)} (${(a.scored_by ?? 0).toLocaleString('id-ID')} suara)` : null],
    ['Peringkat', a.rank ? `#${a.rank}` : null],
    ['Durasi', a.duration],
    ['Rating usia', a.rating],
  ].filter(([, v]) => v != null && v !== '');

  const info = h('div', {},
    h('h1', {}, it.title),
    a.title_japanese ? h('p', { class: 'meta', lang: 'ja' }, String(a.title_japanese)) : null,
    h('ul', { class: 'tags' }, [...names('genres'), ...names('themes')].map(n => h('li', {}, n))),
    h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])),
    h('h2', {}, 'Sinopsis'),
    h('p', { class: 'syn' }, a.synopsis || 'Sinopsis belum tersedia.'),
    watchPanel({ ...it, total }));

  const article = h('article', { class: 'detail' },
    h('div', { class: 'side' },
      poster(it.title, a.images?.webp?.large_image_url ?? it.image, true),
      favButton(it, 'inline')),
    info);

  const recs = section('Rekomendasi', async s => ({
    data: (await api.recommendations(id, s)).map(r => r?.entry),
  }), signal, 12);

  show(it.title, article, recs.wrap);
  recs.run();

  api.streaming(id, signal).then(list => {
    const links = list
      .filter(s => s && typeof s.name === 'string')
      .map(s => ({ name: s.name, href: safeLink(s.url) }))
      .filter(l => l.href);
    if (!links.length) return;
    info.append(
      h('h2', {}, 'Tonton di layanan resmi'),
      h('p', { class: 'meta' }, 'Tautan dari MyAnimeList. Kakemono tidak memutar atau menyimpan video.'),
      h('ul', { class: 'tags' }, links.map(l =>
        h('li', {}, h('a', { href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.name)))));
  }).catch(e => {
    if (e.kind !== 'aborted') console.warn('Streaming tidak tersedia', e.kind);
  });
}

// ---------- koleksi ----------
function progressLine(w) {
  return h('p', { class: 'prog-line' },
    `${WATCH_STATUSES[w.status]} · ep ${w.episode}${w.total ? ` / ${w.total}` : ''}`);
}

function renderFavorites() {
  const favs = readFavorites();
  const watch = readWatch();
  show('Koleksi', h('h1', {}, 'Koleksimu'),
    h('h2', {}, 'Favorit'),
    favs.length
      ? h('ul', { class: 'grid' }, favs.map(f => card(f)))
      : emptyState('Belum ada favorit. Tekan Simpan pada anime mana pun untuk menambahkannya.', browseLink()),
    h('h2', {}, 'Daftar tontonan'),
    watch.length
      ? h('ul', { class: 'grid' }, watch.map(w => card(w, progressLine(w))))
      : emptyState('Belum ada daftar tontonan. Buka detail anime lalu pilih statusnya.'));
}
route('/favorites', renderFavorites);

// ---------- developer ----------
function renderDeveloper() {
  show('Developer', h('section', { class: 'dev' },
    h('img', {
      class: 'avatar', src: '/img/xs0ciety.png', width: 160, height: 160,
      alt: 'Foto profil xs0cietyHUB', decoding: 'async',
    }),
    h('div', {},
      h('h1', {}, 'xs0cietyHUB'),
      h('p', { class: 'lede' }, 'Developer Kakemono. Bug, saran, atau kerja sama, hubungi lewat salah satu akun di bawah.'),
      h('ul', { class: 'social' }, SOCIALS.map(s =>
        h('li', {},
          h('a', { href: s.href, target: '_blank', rel: 'noopener noreferrer' },
            icon(s.icon),
            h('span', {}, s.label),
            h('span', { class: 'handle' }, s.handle))))))));
}
route('/developer', renderDeveloper);

// ---------- 404 ----------
function notFound() {
  show('Tidak ditemukan', h('div', { class: 'state' },
    h('p', { class: 'nf' }, '404'),
    h('p', {}, 'Halaman ini tidak ada atau sudah dipindahkan.'),
    h('a', { class: 'btn primary', href: '/', 'data-link': '' }, 'Kembali ke beranda')));
}
onNotFound(notFound);

// ---------- bar bawah ----------
document.getElementById('tabbar').replaceChildren(...TABS.map(t =>
  h('a', { href: t.href, 'data-link': '' }, icon(t.icon), h('span', {}, t.label))));

start();
