import { h, poster, toast } from './dom.js';
import * as api from './api.js';
import {
  readFavorites, isFavorite, toggleFavorite,
  readWatch, getWatch, setWatch, removeWatch, WATCH_STATUSES,
} from './store.js';
import { route, onNotFound, start } from './router.js';

const main = document.getElementById('main');
const TYPES = ['TV', 'movie', 'OVA', 'ONA', 'special', 'music'];
const STATUSES = { current: 'Sedang tayang', finished: 'Selesai', upcoming: 'Akan tayang' };
const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON = {
  home: ['M3 10.5L12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-4.2-4.2'],
  bookmark: ['M6 3h12v18l-6-4.5L6 21z'],
  code: ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M13.5 5l-3 14'],
  instagram: [
    'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z',
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M17.5 6.5h.01',
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
  document.title = title ? `${title} — Kakemono` : 'Kakemono — Temukan Anime';
  main.replaceChildren(...nodes.flat().filter(Boolean));
  document.querySelectorAll('#tabbar a').forEach(a => {
    if (a.pathname === location.pathname) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  main.focus({ preventScroll: true });
  scrollTo(0, 0);
}

const MESSAGES = {
  network: 'Koneksi lambat atau terputus. Gagal memuat data.',
  rate: 'Terlalu banyak permintaan ke server. Tunggu sebentar.',
  server: 'Server Kitsu sedang bermasalah.',
  data: 'Data tidak dapat dibaca.',
};

function errorState(err, retry) {
  console.error('API Error:', err.kind, err.message);
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
    toast(!r.ok ? 'Gagal menyimpan favorit' : nowSaved ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
    if (location.pathname === '/favorites' && !nowSaved) renderFavorites();
  });
  return btn;
}

const toItem = (kitsuData) => {
  if (!kitsuData || !kitsuData.attributes) return null;
  const attr = kitsuData.attributes;
  // Ambil gambar dari Kitsu
  const posterImg = attr.posterImage?.medium || attr.posterImage?.small || attr.posterImage?.original || null;
  
  return {
    id: parseInt(kitsuData.id, 10),
    title: String(attr.canonicalTitle || attr.titles?.en || 'Tanpa judul'),
    image: posterImg,
    type: attr.subtype || '',
    year: attr.startDate ? parseInt(attr.startDate.split('-')[0], 10) : null,
    score: attr.averageRating ? parseFloat(attr.averageRating) : null,
  };
};

function card(item, extra = null) {
  if (!item) return null;
  const sub = [item.type, item.year].filter(Boolean).join(' • ');
  return h('li', { class: 'card' },
    h('a', { href: `/anime/${item.id}`, 'data-link': '' },
      poster(item.title, item.image),
      h('h3', {}, item.title),
      h('div', { class: 'meta' }, sub, item.score ? [' • ', h('span', { class: 'score' }, item.score.toFixed(1))] : null)),
    extra,
    favButton(item));
}

function section(title, loader, signal, limit = 12) {
  const body = h('div', {}, skeletons(6));
  const run = async () => {
    body.replaceChildren(skeletons(6));
    try {
      const res = await loader(signal);
      const rawItems = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
      const items = rawItems.map(toItem).filter(Boolean).slice(0, limit);
      
      if (items.length) {
        body.replaceChildren(h('ul', { class: 'grid' }, items.map(i => card(i))));
      } else {
        body.replaceChildren(emptyState('Belum ada data untuk bagian ini.'));
      }
      return items;
    } catch (e) {
      if (e.kind !== 'aborted') body.replaceChildren(errorState(e, run));
      return [];
    }
  };
  return { wrap: h('section', {}, h('h2', {}, title), body), run };
}

route('/', async ({ signal }) => {
  const feat = h('div', {});
  const popular = section('Paling Populer', api.topAnime, signal);
  const season = section('Tayang Musim Ini', api.seasonNow, signal);
  
  show('', h('div', { class: 'hero' },
    h('div', {},
      h('h1', {}, 'Temukan anime berikutnya.'),
      h('p', { class: 'lede' }, 'Cari judul, jelajahi genre, dan catat progres tontonanmu dengan mudah.'),
      h('a', { class: 'btn primary', href: '/browse', 'data-link': '' }, 'Mulai Jelajah')),
    feat),
    popular.wrap, season.wrap);

  const items = await popular.run();
  if (items[0]) {
    const f = items[0];
    feat.replaceChildren(h('a', { class: 'feat', href: `/anime/${f.id}`, 'data-link': '' },
      poster(f.title, f.image, true),
      h('div', {}, h('h3', {}, f.title),
        h('p', {}, `Paling populer saat ini${f.type ? ` • ${f.type}` : ''}.`))));
  }
  await season.run();
});

function readParams(query) {
  const page = parseInt(query.get('page') || '1', 10);
  const genre = query.get('genre') || '';
  const type = query.get('type') || '';
  const status = query.get('status') || '';
  return {
    q: (query.get('q') || '').trim().slice(0, 100),
    genre: genre, type: TYPES.includes(type) ? type : '',
    status: Object.hasOwn(STATUSES, status) ? status : '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

route('/browse|/search', ({ query, signal }) => browse(readParams(query), signal));

function browse(p, navSignal) {
  const results = h('div', {});
  let searchCtl = null;
  let timer = null;

  const q = h('input', { type: 'search', name: 'q', maxlength: 100, placeholder: 'Ketik judul anime...', value: p.q });
  const genre = h('select', { 'aria-label': 'Genre' }, h('option', { value: '' }, 'Semua Genre'));
  const type = h('select', { 'aria-label': 'Tipe' }, h('option', { value: '' }, 'Semua Tipe'), TYPES.map(t => h('option', { value: t }, t)));
  const status = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'Semua Status'), Object.entries(STATUSES).map(([v, l]) => h('option', { value: v }, l)));
  
  type.value = p.type;
  status.value = p.status;

  const form = h('form', { class: 'bar', role: 'search', onsubmit: e => { e.preventDefault(); apply(1); } }, q, genre, type, status);
  const current = () => ({ q: q.value.trim().slice(0, 100), genre: genre.value, type: type.value, status: status.value });

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
      const res = await api.searchAnime(s, ctl.signal);
      if (ctl.signal.aborted) return;
      const items = (res.data || []).map(toItem).filter(Boolean);
      const nextLink = res.links?.next;
      
      if (!items.length) {
        results.replaceChildren(emptyState('Tidak ada anime yang cocok dengan pencarianmu.', 
          h('button', { class: 'btn', type: 'button', onclick: () => { q.value = ''; genre.value = ''; type.value = ''; status.value = ''; apply(1); } }, 'Reset Filter')));
        return;
      }
      results.replaceChildren(
        h('ul', { class: 'grid' }, items.map(i => card(i))),
        h('nav', { class: 'pager', 'aria-label': 'Halaman' },
          h('button', { class: 'btn', type: 'button', disabled: s.page <= 1, onclick: () => apply(s.page - 1) }, 'Sebelumnya'),
          h('span', {}, `Hal ${s.page}`),
          h('button', { class: 'btn', type: 'button', disabled: !nextLink, onclick: () => apply(s.page + 1) }, 'Berikutnya')));
    } catch (e) {
      if (ctl.signal.aborted || e.kind === 'aborted') return;
      results.replaceChildren(errorState(e, () => load(s)));
    }
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => apply(1), 500); });
  [genre, type, status].forEach(el => el.addEventListener('change', () => apply(1)));
  navSignal.addEventListener('abort', () => { clearTimeout(timer); searchCtl?.abort(); }, { once: true });

  show('Jelajah', h('h1', {}, 'Jelajah Anime'), form, results);

  api.genres(navSignal).then(list => {
    list.forEach(g => genre.append(h('option', { value: g.attributes.slug }, g.attributes.title)));
    genre.value = p.genre;
  }).catch(e => { if (e.kind !== 'aborted') console.warn('Genre gagal dimuat'); });

  load(p);
}

function watchPanel(item) {
  const box = h('div', { class: 'watch' });

  const render = () => {
    const rec = getWatch(item.id);
    const ep = rec?.episode ?? 0;
    const total = item.total;
    const nextStatus = rec && rec.status !== 'planning' ? rec.status : 'watching';
    const percent = total ? Math.min((ep / total) * 100, 100) : 0;

    const save = (patch, msg) => {
      const r = setWatch(item, patch);
      if (!r.ok) toast('Gagal menyimpan progres');
      else if (msg) toast(msg);
      render();
    };

    const sel = h('select', { 'aria-label': 'Status tontonan' },
      h('option', { value: '' }, 'Belum ditambahkan'),
      Object.entries(WATCH_STATUSES).map(([v, l]) => h('option', { value: v }, l)));
    sel.value = rec?.status ?? '';
    sel.addEventListener('change', () => {
      if (!sel.value) { removeWatch(item.id); toast('Dihapus dari daftar'); render(); }
      else { save({ status: sel.value }, 'Status diperbarui'); }
    });

    const epIn = h('input', { type: 'number', min: '0', max: String(total ?? 9999), step: '1', 'aria-label': 'Episode', value: String(ep) });
    epIn.addEventListener('change', () => {
      const n = Math.trunc(Number(epIn.value));
      if (!Number.isFinite(n) || n < 0) return render();
      save({ episode: n, status: nextStatus }, 'Progres disimpan');
    });

    const minus = h('button', { class: 'btn', type: 'button', disabled: ep <= 0, onclick: () => save({ episode: ep - 1, status: nextStatus }, 'Progres disimpan') }, '−1 Eps');
    const plus = h('button', { class: 'btn primary', type: 'button', disabled: total != null && ep >= total, onclick: () => save({ episode: ep + 1, status: nextStatus }, 'Progres disimpan') }, '+1 Eps');
    
    const completeBtn = total && ep < total ? h('button', { class: 'btn', type: 'button', onclick: () => save({ episode: total, status: 'completed' }, 'Ditandai Selesai') }, 'Tandai Selesai') : null;

    box.replaceChildren(
      h('h3', {}, 'Tracker Tontonan'),
      h('div', { class: 'row' }, sel),
      total ? h('div', { class: 'progress-container' }, h('div', { class: 'progress-bar', style: `width: ${percent}%` })) : null,
      h('div', { class: 'row' },
        h('span', {}, 'Episode ke-'), epIn, h('span', {}, `/ ${total ?? '?'}`),
        minus, plus, completeBtn
      ),
      h('p', { class: 'prog' }, rec ? `Status: ${WATCH_STATUSES[rec.status]} • Ditonton: ${ep} episode` : 'Pilih status atau tambah episode untuk mulai mencatat.')
    );
  };
  render();
  return box;
}

route('/anime/(\\d{1,7})', ({ params, signal }) => renderAnime(Number(params[0]), signal));

async function renderAnime(id, signal) {
  show('Memuat…', h('p', { class: 'lede' }, 'Memuat detail anime...'));

  let res;
  try {
    res = await api.animeFull(id, signal);
    if (!res.data || parseInt(res.data.id, 10) !== id) throw new api.ApiError('data', 'Data mismatch');
  } catch (e) {
    if (e.kind === 'aborted') return;
    if (e.kind === 'notfound') return notFound();
    show('Gagal Memuat', errorState(e, () => renderAnime(id, signal)));
    return;
  }

  const attr = res.data.attributes;
  const it = toItem(res.data);
  
  const included = res.included || [];
  const categories = included.filter(x => x.type === 'categories').map(x => x.attributes.title);
  const streaming = included.filter(x => x.type === 'streamingLinks').map(x => ({ name: x.attributes.url, href: x.attributes.url }));
  
  const totalEpisodes = attr.episodeCount;
  const synopsis = attr.synopsis || 'Sinopsis belum tersedia.';

  const facts = [
    ['Tipe', attr.subtype],
    ['Episode', totalEpisodes || '?'],
    ['Status', attr.status === 'current' ? 'Sedang Tayang' : attr.status === 'finished' ? 'Selesai' : attr.status],
    ['Tayang', attr.startDate],
    ['Skor', attr.averageRating ? parseFloat(attr.averageRating).toFixed(2) : null],
    ['Durasi', attr.episodeLength ? `${attr.episodeLength} menit` : null],
    ['Rating', attr.ageRatingGuide || attr.ageRating],
  ].filter(([, v]) => v != null && v !== '');

  const info = h('div', {},
    h('h1', {}, it.title),
    attr.titles?.ja_jp ? h('p', { class: 'meta', lang: 'ja', style: 'margin-bottom: 1rem;' }, attr.titles.ja_jp) : null,
    h('ul', { class: 'tags' }, categories.map(n => h('li', {}, n))),
    h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])),
    h('h2', {}, 'Sinopsis'),
    h('p', { class: 'syn' }, synopsis),
    watchPanel({ ...it, total: totalEpisodes }));

  const article = h('article', { class: 'detail' },
    h('div', { class: 'side' }, poster(it.title, attr.posterImage?.large || attr.posterImage?.original || it.image, true), favButton(it, 'inline')),
    info);

  show(it.title, article);

  if (streaming.length) {
    info.append(
      h('h2', {}, 'Tonton Resmi'),
      h('p', { class: 'meta', style: 'margin-bottom: 1rem;' }, 'Tautan diarahkan ke layanan legal.'),
      h('ul', { class: 'tags' }, streaming.map(l => h('li', {}, h('a', { href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.name)))));
  }
}

function progressLine(w) {
  return h('p', { class: 'meta', style: 'color: var(--teal); font-weight: 500;' }, `${WATCH_STATUSES[w.status]} • Eps ${w.episode}${w.total ? ` / ${w.total}` : ''}`);
}

function renderFavorites() {
  const favs = readFavorites();
  const watch = readWatch();
  show('Koleksi', h('h1', {}, 'Koleksi Saya'),
    h('h2', {}, 'Favorit'),
    favs.length ? h('ul', { class: 'grid' }, favs.map(f => card(f))) : emptyState('Belum ada favorit. Tekan "Simpan" pada anime untuk menambahkannya.', browseLink()),
    h('h2', {}, 'Daftar Tontonan'),
    watch.length ? h('ul', { class: 'grid' }, watch.map(w => card(w, progressLine(w)))) : emptyState('Belum ada daftar tontonan. Buka detail anime lalu atur progresnya.'));
}
route('/favorites', renderFavorites);

function renderDeveloper() {
  show('Developer', h('section', { class: 'dev' },
    h('img', { class: 'avatar', src: '/img/xs0ciety.png', width: 160, height: 160, alt: 'Foto Profil xs0cietyHUB', decoding: 'async', onerror: (e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="%231d2040"/><circle cx="80" cy="60" r="30" fill="%2331365c"/><path d="M40 140c0-22 18-40 40-40s40 18 40 40" fill="%2331365c"/></svg>'; } }),
    h('div', {},
      h('h1', {}, 'xs0cietyHUB'),
      h('p', { class: 'lede', style: 'margin: 0 auto 1.5rem;' }, 'Developer independen di balik Kakemono. Punya saran, laporan bug, atau ingin bekerja sama? Hubungi saya lewat tautan di bawah.'),
      h('ul', { class: 'social' }, SOCIALS.map(s =>
        h('li', {},
          h('a', { href: s.href, target: '_blank', rel: 'noopener noreferrer' },
            icon(s.icon),
            h('span', {}, s.label),
            h('span', { class: 'handle' }, s.handle))))))));
}
route('/developer', renderDeveloper);

function notFound() {
  show('Tidak Ditemukan', h('div', { class: 'state' },
    h('p', { class: 'nf' }, '404'),
    h('p', {}, 'Halaman yang kamu cari tidak ada atau sudah dipindahkan.'),
    h('a', { class: 'btn primary', href: '/', 'data-link': '' }, 'Kembali ke Beranda')));
}
onNotFound(notFound);

document.getElementById('tabbar').replaceChildren(...TABS.map(t =>
  h('a', { href: t.href, 'data-link': '' }, icon(t.icon, 24), h('span', {}, t.label))));

start();