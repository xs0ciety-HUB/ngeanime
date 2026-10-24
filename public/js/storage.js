const KEY = 'xs0ciety.collection.v1';

export function loadCollection() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(x => x && x.animeId && x.title) : [];
  } catch { return []; }
}

export function addToCollection(item) {
  const items = loadCollection();
  if (items.some(x => x.animeId === item.animeId)) return items;
  const next = [item, ...items].slice(0, 200);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeFromCollection(animeId) {
  const next = loadCollection().filter(x => x.animeId !== animeId);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function isInCollection(animeId) {
  return loadCollection().some(x => x.animeId === animeId);
}