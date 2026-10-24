import { h, poster, toast } from './dom.js';
import * as api from './api.js';
import {
  readFavorites, isFavorite, toggleFavorite,
  readWatch, getWatch, setWatch, removeWatch, WATCH_STATUSES,
} from './store.js';
import { route, onNotFound, start } from './router.js';

const main = document.getElementById('main');
const TYPES = ['TV', 'movie', 'OVA', 'ONA', 'special', 'music']; // Kitsu menggunakan kapitalisasi ini
const STATUSES = { current: 'Sedang tayang', finished: 'Selesai', upcoming: 'Akan tayang' };
const SVG_NS = 'http://www.w3.org/2000/svg';

// ... (Bagian ICON, TABS, SOCIALS, icon(), show(), MESSAGES, errorState, emptyState, skeletons, browseLink, favButton SAMA seperti sebelumnya) ...

// --- MAPPING DATA KITSU KE FORMAT INTERNAL ---
const toItem = (kitsuData) => {
  if (!kitsuData || !kitsuData.attributes) return null;
  const attr = kitsuData.attributes;
  const posterImg = attr.posterImage?.medium || attr.posterImage?.small || attr.posterImage?.original;
  
  return {
    id: parseInt(kitsuData.id, 10),
    title: String(attr.canonicalTitle || attr.titles?.en || 'Tanpa judul'),
    image: posterImg || null,
    type: attr.subtype || '',
    year: attr.startDate ? parseInt(attr.startDate.split('-')[0], 10) : null,
    score: attr.averageRating ? parseFloat(attr.averageRating) : null,
  };
};

// ... (Fungsi card() dan section() sedikit disesuaikan dengan data Kitsu) ...

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
      // Kitsu mengembalikan { data: [...] }
      const rawItems = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
      const items = rawItems.map(toItem).filter(Boolean).slice(0, limit);
      
      body.replaceChildren(items.length ? h('ul', { class: 'grid' }, items.map(i => card(i))) : emptyState('Belum ada data.'));
      return items;
    } catch (e) {
      if (e.kind !== 'aborted') body.replaceChildren(errorState(e, run));
      return [];
    }
  };
  return { wrap: h('section', {}, h('h2', {}, title), body), run };
}

// --- HALAMAN BERANDA ---
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

// --- HALAMAN JELAJAH ---
// ... (Bagian readParams, browse() disesuaikan dengan endpoint Kitsu) ...
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
      const meta = res.meta || {};
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

// --- HALAMAN DETAIL ---
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
  
  // Relasi Kitsu (categories, episodes, streamingLinks)
  const included = res.included || [];
  const categories = included.filter(x => x.type === 'categories').map(x => x.attributes.title);
  const streaming = included.filter(x => x.type === 'streamingLinks').map(x => ({ name: x.attributes.url, href: x.attributes.url }));
  
  const totalEpisodes = attr.episodeCount;
  const synopsis = attr.synopsis || 'Sinopsis belum tersedia.';

  // Facts untuk Kitsu
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

// ... (Fungsi renderFavorites, renderDeveloper, notFound, watchPanel, dll. TETAP SAMA) ...

start();