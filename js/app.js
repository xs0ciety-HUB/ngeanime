import { h, poster, toast } from './dom.js';
import * as api from './api.js';
import { readFavorites, isFavorite, toggleFavorite } from './store.js';
import { route, onNotFound, navigate, start } from './router.js';

const main = document.getElementById('main');
const TYPES = ['tv', 'movie', 'ova', 'special', 'ona', 'music'];
const STATUSES = { airing: 'Sedang tayang', complete: 'Selesai', upcoming: 'Akan tayang' };

// ---------- shared UI ----------
function show(title, ...nodes) {
  document.title = title ? `${title} — Kakemono` : 'Kakemono — temukan anime';
  main.replaceChildren(...nodes.flat());
  const path = location.pathname;
  document.querySelectorAll('.top nav a').forEach(a => {
    if (new URL(a.href).pathname === path) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
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
    h('p', {}, MESSAGES[err.kind] || 'Terjadi kesalahan di aplikasi. Muat ulang halaman.'),
    retry && h('button', { class: 'btn', type: 'button', onclick: retry }, 'Coba lagi'));
}

const emptyState = (text, link) => h('div', { class: 'state' }, h('p', {}, text), link);
const skeletons = n => h('ul', { class: 'grid', 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('li', { class: 'sk' })));
const ignoreAbort = e => { if (e.kind !== 'aborted') throw e; };

function favButton(item) {
  const btn = h('button', { class: 'fav', type: 'button', 'aria-pressed': String(isFavorite(item.id)) },
    isFavorite(item.id) ? 'Tersimpan' : 'Simpan');
  btn.setAttribute('aria-label', `Simpan ${item.title} ke favorit`);
  btn.addEventListener('click', () => {
    const r = toggleFavorite(item);
    btn.setAttribute('aria-pressed', String(r.active));
    btn.textContent = r.active ? 'Tersimpan' : 'Simpan';
    toast(!r.ok ? 'Penyimpanan browser gagal. Favorit tidak tersimpan.' : r.active ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit');
    if (location.pathname === '/favorites' && !r.active) route_favorites();
  });
  return btn;
}

function card(item) {
  const sub = [item.type, item.year].filter(Boolean).join(', ');
  return h('li', { class: 'card' },
    h('a', { href: `/anime/${item.id}`, 'data-link': '' },
      poster(item.title, item.image),
      h('h3', {}, item.title),
      h('div', { class: 'meta' }, sub, item.score ? [' ', h('span', { class: 'score' }, item.score.toFixed(1))] : null)),
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

async function section(title, loader, signal, limit = 12) {
  const body = h('div', {}, skeletons(6));
  const run = async () => {
    body.replaceChildren(skeletons(6));
    try {
      const items = toItems((await loader(signal)).data).slice(0, limit);
      body.replaceChildren(items.length ? h('ul', { class: 'grid' }, items.map(card)) : emptyState('Belum ada data untuk bagian ini.'));
      return items;
    } catch (e) {
      ignoreAbort(e);
      body.replaceChildren(errorState(e, run));
    }
  };
  const wrap = h('section', {}, h('h2', {}, title), body);
  return { wrap, run };
}

// ---------- pages ----------
route('/', async ({ signal }) => {
  const feat = h('div', {});
  const popular = await section('Paling populer', api.topAnime, signal);
  const season = await section('Tayang musim ini', api.seasonNow, signal);
  show('', h('div', { class: 'hero' },
    h('div', {}, h('h1', {}, 'Temukan anime berikutnya.'),
      h('p', { class: 'lede' }, 'Cari judul, jelajahi genre, dan simpan daftar tontonanmu. Semua data dari MyAnimeList.'),
      h('a', { class: 'btn primary', href: '/browse', 'data-link': '', style: 'display:inline-block;text-decoration:none;line-height:1.5' }, 'Mulai jelajah')),
    feat), popular.wrap, season.wrap);
  const items = await popular.run();
  if (signal.aborted) return;
  if (items?.[0]) {
    const f = items[0];
    feat.replaceChildren(h('a', { class: 'feat', href: `/anime/${f.id}`, 'data-link': '' },
      poster(f.title, f.image, true), h('div', {}, h('h3', {}, f.title), h('p', {}, `Populer sekarang. ${f.type || ''}`))));
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
    genre: /^\d{1,4}$/.test(genre) ? genre : '',
    type: TYPES.includes(type) ? type : '',
    status: status in STATUSES ? status : '',
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

route('/browse|/search', ({ query, signal }) => browse(readParams(query), signal));

function browse(p, navSignal) {
  const results = h('div', {});
  let searchCtl = null;
  let timer = null;

  const q = h('input', { type: 'search', name: 'q', maxlength: 100, placeholder: 'Cari judul anime', 'aria-label': 'Cari judul anime', value: p.q });
  const genre = h('select', { 'aria-label': 'Genre' }, h('option', { value: '' }, 'Semua genre'));
  const type = h('select', { 'aria-label': 'Tipe' }, h('option', { value: '' }, 'Semua tipe'), TYPES.map(t => h('option', { value: t }, t.toUpperCase())));
  const status = h('select', { 'aria-label': 'Status' }, h('option', { value: '' }, 'Semua status'), Object.entries(STATUSES).map(([v, l]) => h('option', { value: v }, l)));
  type.value = p.type; status.value = p.status;
  const form = h('form', { class: 'bar', role: 'search', onsubmit: e => { e.preventDefault(); apply(1); } }, q, genre, type, status);

  const current = () => ({ q: q.value.trim().slice(0, 100), genre: genre.value, type: type.value, status: status.value });

  function apply(page) {
    clearTimeout(timer);
    const s = current();
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(s)) if (v) usp.set(k, v);
    if (page > 1) usp.set('page', page);
    history.replaceState(null, '', `/browse${usp.size ? `?${usp}` : ''}`);
    load({ ...s, page });
  }

  async function load(s) {
    searchCtl?.abort();
    searchCtl = new AbortController();
    const sig = searchCtl.signal;
    navSignal.addEventListener('abort', () => searchCtl?.abort(), { once: true });
    results.replaceChildren(skeletons(8));
    const params = { q: s.q, genres: s.genre, type: s.type, status: s.status, page: s.page, order_by: s.q ? undefined : 'popularity' };
    try {
      const res = await api.searchAnime(params, sig);
      if (sig.aborted) return;
      const items = toItems(res.data);
      const pg = res.pagination || {};
      if (!items.length) {
        results.replaceChildren(emptyState('Tidak ada anime yang cocok. Ubah kata kunci atau longgarkan filter.',
          h('button', { class: 'btn', type: 'button', onclick: () => { form.reset(); q.value = ''; apply(1); } }, 'Reset filter')));
        return;
      }
      results.replaceChildren(h('ul', { class: 'grid' }, items.map(card)), h('nav', { class: 'pager', 'aria-label': 'Halaman' },
        h('button', { class: 'btn', type: 'button', disabled: s.page <= 1, onclick: () => apply(s.page - 1) }, 'Sebelumnya'),
        h('span', {}, `Halaman ${s.page}${Number.isInteger(pg.last_visible_page) ? ` dari ${pg.last_visible_page}` : ''}`),
        h('button', { class: 'btn', type: 'button', disabled: !pg.has_next_page, onclick: () => apply(s.page + 1) }, 'Berikutnya')));
    } catch (e) {
      if (e.kind === 'aborted') return;
      results.replaceChildren(errorState(e, () => load(s)));
    }
  }

  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => apply(1), 400); });
  [genre, type, status].forEach(el => el.addEventListener('change', () => apply(1)));
  navSignal.addEventListener('abort', () => clearTimeout(timer), { once: true });

  show('Jelajah', h('h1', {}, 'Jelajah anime'), form, results);
  api.genres(navSignal).then(list => {
    list.filter(g => Number.isInteger(g.mal_id) && typeof g.name === 'string')
      .forEach(g => genre.append(h('option', { value: g.mal_id }, g.name)));
    genre.value = p.genre;
  }).catch(e => { if (e.kind !== 'aborted') console.warn('Genres unavailable', e.kind); });
  load(p);
}

route('/anime/(\\d{1,7})', async ({ params, signal }) => {
  const id = Number(params[0]);
  const body = h('div', {}, skeletons(1));
  show('Memuat…', body);
  const run = async () => {
    try {
      const a = (await api.animeFull(id, signal)).data;
      if (!a || a.mal_id !== id) throw new api.ApiError('data', 'Mismatch');
      const it = toItem(a);
      const names = key => (Array.isArray(a[key]) ? a[key] : []).map(x => x?.name).filter(n => typeof n === 'string');
      const facts = [
        ['Tipe', a.type], ['Episode', a.episodes], ['Status', a.status], ['Tayang', a.aired?.string],
        ['Studio', names('studios').join(', ')], ['Musim', a.season && a.year ? `${a.season} ${a.year}` : a.year],
        ['Skor', a.score ? `${a.score.toFixed(2)} (${(a.scored_by ?? 0).toLocaleString('id-ID')} suara)` : null],
        ['Peringkat', a.rank ? `#${a.rank}` : null], ['Durasi', a.duration], ['Rating usia', a.rating],
      ].filter(([, v]) => v != null && v !== '');
      body.replaceChildren(h('article', { class: 'detail' },
        h('div', {}, poster(it.title, a.images?.webp?.large_image_url ?? it.image, true), h('div', { style: 'margin-top:1rem;position:relative' }, favButton(it))),
        h('div', {}, h('h1', {}, it.title),
          a.title_japanese && h('p', { class: 'meta', lang: 'ja' }, String(a.title_japanese)),
          h('ul', { class: 'tags' }, [...names('genres'), ...names('themes')].map(n => h('li', {}, n))),
          h('dl', { class: 'facts' }, facts.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, String(v))])),
          h('h2', {}, 'Sinopsis'),
          h('p', { class: 'syn' }, a.synopsis || 'Sinopsis belum tersedia.'))));
      document.title = `${it.title} — Kakemono`;
      api.streaming(id, signal).then(list => {
        const links = list.filter(s => typeof s?.url === 'string' && typeof s?.name === 'string');
        if (!links.length) return;
        body.querySelector('.detail > div:last-child').append(
          h('h2', {}, 'Nonton legal di'),
          h('ul', { class: 'tags streaming' }, links.map(s =>
            h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.name)))));
      }).catch(e => { if (e.kind !== 'aborted') console.warn('Streaming unavailable', e.kind); });
      const recs = await section('Rekomendasi', async s => ({ data: (await api.recommendations(id, s)).map(r => r.entry) }), signal, 12);
      body.append(recs.wrap);
      await recs.run();
    } catch (e) {
      if (e.kind === 'aborted') return;
      if (e.kind === 'notfound') return notFound();
      body.replaceChildren(errorState(e, run));
    }
  };
  await run();
});

function route_favorites() {
  const favs = readFavorites();
  show('Favorit', h('h1', {}, 'Favoritmu'),
    favs.length ? h('ul', { class: 'grid' }, favs.map(f => card({ ...f, type: '', year: null, score: null })))
      : emptyState('Belum ada favorit. Tekan Simpan pada anime mana pun untuk menambahkannya.',
        h('a', { class: 'btn primary', href: '/browse', 'data-link': '', style: 'display:inline-block;text-decoration:none;line-height:1.5' }, 'Cari anime')));
}
route('/favorites', route_favorites);

function notFound() {
  show('Tidak ditemukan', h('div', { class: 'state' }, h('p', { class: 'nf' }, '404'),
    h('p', {}, 'Halaman ini tidak ada atau sudah dipindahkan.'),
    h('a', { class: 'btn primary', href: '/', 'data-link': '', style: 'display:inline-block;text-decoration:none;line-height:1.5' }, 'Kembali ke beranda')));
}
onNotFound(notFound);

start();
export { navigate };
