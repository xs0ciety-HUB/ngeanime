const BASE = 'https://wajik-anime-api.vercel.app/otakudesu';

export class ApiError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new ApiError('network', `HTTP ${res.status}`);
  const json = await res.json();
  if (json.statusCode && json.statusCode !== 200) throw new ApiError('data', json.message || 'API Error');
  return json;
}

// Beranda: Ongoing & Completed
export const getHome = async () => {
  const [ongoing, completed] = await Promise.all([
    fetchJson('/ongoing?page=1'),
    fetchJson('/complete?page=1')
  ]);
  return { ongoing: ongoing.data?.animeList || [], completed: completed.data?.animeList || [] };
};

// Pencarian
export const searchAnime = (q) => fetchJson(`/search?q=${encodeURIComponent(q)}`);

// Detail Anime (mengembalikan info + daftar episode)
export const getAnimeDetail = (animeId) => fetchJson(`/anime/${animeId}`);

// Streaming Episode (mengembalikan URL video)
export const getEpisodeStream = (episodeId) => fetchJson(`/episode/${episodeId}`);