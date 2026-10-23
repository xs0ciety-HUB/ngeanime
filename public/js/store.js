// Penyimpanan lokal (localStorage) untuk favorit dan daftar tontonan.
// Data divalidasi saat dibaca dan ditulis. Kegagalan storage tidak pernah melempar error.
const FAV_KEY = 'kakemono.favorites.v1';
const WATCH_KEY = 'kakemono.watch.v1';
const MAX = 200;

export const WATCH_STATUSES = {
  planning: 'Rencana',
  watching: 'Sedang ditonton',
  completed: 'Selesai',
  onhold: 'Ditunda',
  dropped: 'Ditinggalkan',
};

const validBase = f => !!f && Number.isInteger(f.id) && f.id > 0
  && typeof f.title === 'string' && f.title.length <= 300
  && (typeof f.image === 'string' || f.image === null);

const validWatch = w => validBase(w) && Object.hasOwn(WATCH_STATUSES, w.status)
  && Number.isInteger(w.episode) && w.episode >= 0
  && (w.total === null || (Number.isInteger(w.total) && w.total > 0));

function readList(key, check) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list.filter(check).slice(0, MAX) : [];
  } catch (e) {
    console.warn('Data lokal tidak terbaca', e);
    return [];
  }
}

function writeList(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list.slice(0, MAX)));
    return true;
  } catch (e) {
    console.warn('Data lokal tidak tersimpan', e);
    return false;
  }
}

// Favorit
export const readFavorites = () => readList(FAV_KEY, validBase);
export const isFavorite = id => readFavorites().some(f => f.id === id);

export function toggleFavorite({ id, title, image }) {
  const list = readFavorites();
  const i = list.findIndex(f => f.id === id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ id, title: String(title).slice(0, 300), image: typeof image === 'string' ? image : null });
  return { ok: writeList(FAV_KEY, list), active: i < 0 };
}

// Daftar tontonan
export const readWatch = () => readList(WATCH_KEY, validWatch);
export const getWatch = id => readWatch().find(w => w.id === id) ?? null;

export function setWatch(item, patch) {
  const list = readWatch();
  const i = list.findIndex(w => w.id === item.id);
  const total = Number.isInteger(item.total) && item.total > 0 ? item.total : null;
  const prev = i >= 0 ? list[i] : {
    id: item.id,
    title: String(item.title).slice(0, 300),
    image: typeof item.image === 'string' ? item.image : null,
    status: 'planning',
    episode: 0,
    total,
  };
  const next = { ...prev, ...patch, total: prev.total ?? total };
  const cap = next.total ?? Infinity;
  next.episode = Math.min(Math.max(0, Math.trunc(Number(next.episode)) || 0), cap);
  if (next.total && next.episode >= next.total) next.status = 'completed';
  if (i >= 0) list[i] = next; else list.unshift(next);
  return { ok: writeList(WATCH_KEY, list), record: next };
}

export function removeWatch(id) {
  return writeList(WATCH_KEY, readWatch().filter(w => w.id !== id));
}