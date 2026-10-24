const KEY = 'xs0ciety.collection.v1';
const MAX_ITEMS = 200;

function isValidItem(item) {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.animeId === 'string' &&
    item.animeId.length > 0 &&
    item.animeId.length <= 200 &&
    typeof item.title === 'string' &&
    item.title.length > 0 &&
    item.title.length <= 200 &&
    (item.poster === null ||
      (typeof item.poster === 'string' && /^https:\/\//i.test(item.poster)))
  );
}

export function loadCollection() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem).slice(0, MAX_ITEMS);
  } catch {
    try { localStorage.removeItem(KEY); } catch {}
    return [];
  }
}

function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch (err) {
    console.warn('Gagal menyimpan koleksi:', err.message);
  }
}

export function addToCollection(item) {
  if (!isValidItem(item)) throw new Error('Item koleksi tidak valid');
  const items = loadCollection();
  if (items.some((x) => x.animeId === item.animeId)) return items;
  const next = [{ ...item }, ...items].slice(0, MAX_ITEMS);
  save(next);
  return next;
}

export function removeFromCollection(animeId) {
  const items = loadCollection().filter((x) => x.animeId !== animeId);
  save(items);
  return items;
}

export function isInCollection(animeId) {
  return loadCollection().some((x) => x.animeId === animeId);
}