import { getEpisode, getServerUrl } from './api.js';
import { el, clear, errorState } from './components.js';

export async function mountPlayer(container, episodeId, { onMeta } = {}) {
  clear(container);
  container.append(el('p', { class: 'player-status' }, 'Menyiapkan sumber video…'));

  try {
    const ep = await getEpisode(episodeId);
    if (onMeta) onMeta(ep);

    let src = ep.defaultStreamingUrl;
    if (!src && ep.server.length > 0) {
      try { src = await getServerUrl(ep.server[0].serverId); } catch {}
    }
    if (!src) throw new Error('Sumber video tidak tersedia dari API.');

    clear(container);
    container.append(el('iframe', { src, allowfullscreen: true, sandbox: 'allow-scripts allow-same-origin allow-presentation', referrerpolicy: 'no-referrer' }));
    return { episode: ep };
  } catch (err) {
    clear(container);
    container.append(errorState('Gagal memuat video', err.message, () => mountPlayer(container, episodeId, { onMeta })));
  }
}