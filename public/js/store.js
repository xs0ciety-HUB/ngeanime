// Favorites in localStorage: validated on read and write; storage failures never throw.
const KEY = 'kakemono.favorites.v1';
const MAX = 200;

const valid = f => f && Number.isInteger(f.id) && f.id > 0 && typeof f.title === 'string' && f.title.length <= 300
  && (typeof f.image === 'string' || f.image === null);

export function readFavorites() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter(valid).slice(0, MAX) : [];
  } catch (e) {
    console.warn('Favorites unreadable, using empty list', e);
    return [];
  }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); return true; }
  catch (e) { console.warn('Favorites not saved', e); return false; }
}

export const isFavorite = id => readFavorites().some(f => f.id === id);

export function toggleFavorite({ id, title, image }) {
  const list = readFavorites();
  const i = list.findIndex(f => f.id === id);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ id, title: String(title).slice(0, 300), image: image ?? null });
  return { ok: write(list), active: i < 0 };
}
