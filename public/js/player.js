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
    if (!src) throw new Error('API tidak menyediakan URL streaming untuk episode ini.');

    const iframe = el('iframe', {
      src,
      title: ep.title || 'Pemutar anime',
      allowfullscreen: true,
      sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      referrerpolicy: 'no-referrer',
      allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
    });
    clear(container);
    container.append(iframe);
    return { episode: ep, currentSrc: src };
  } catch (err) {
    clear(container);
    container.append(
      errorState(
        'Tidak dapat memuat episode',
        err.name === 'AbortError'
          ? 'Permintaan dibatalkan.'
          : err.message || 'Sumber video tidak tersedia.',
        () => mountPlayer(container, episodeId, { onMeta })
      )
    );
    return { error: err };
  }
}

export async function switchServer(container, serverId) {
  clear(container);
  container.append(el('p', { class: 'player-status' }, 'Memuat server…'));
  try {
    const url = await getServerUrl(serverId);
    const iframe = el('iframe', {
      src: url,
      title: 'Pemutar anime',
      allowfullscreen: true,
      sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      referrerpolicy: 'no-referrer',
      allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
    });
    clear(container);
    container.append(iframe);
    return url;
  } catch (err) {
    clear(container);
    container.append(
      errorState(
        'Server tidak dapat dimuat',
        err.message || 'Coba server lain.',
        () => switchServer(container, serverId)
      )
    );
    return null;
  }
}