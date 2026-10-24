import { getEpisode, getServerUrl } from './api.js';
import { el, clear, errorState } from './components.js';

// allow-popups/forms: embed hosts refuse or silently fail to play inside a stricter sandbox.
const SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-forms allow-popups';

function frame(src) {
  return el('iframe', {
    src,
    title: 'Pemutar video',
    allowfullscreen: true,
    allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
    sandbox: SANDBOX,
    // Embed hosts commonly 403 requests that carry no Referer at all; origin-only is the minimum they accept.
    referrerpolicy: 'strict-origin-when-cross-origin',
  });
}

const status = (text) => el('p', { class: 'player-status' }, text);

export async function mountPlayer(container, episodeId, { onMeta, signal, serverBar } = {}) {
  clear(container);
  if (serverBar) clear(serverBar);
  container.append(status('Menyiapkan sumber video…'));

  try {
    const ep = await getEpisode(episodeId, { signal });
    if (signal?.aborted) return null;
    if (onMeta) onMeta(ep);

    const buttons = [];
    const markActive = (btn) => buttons.forEach((b) => b.classList.toggle('btn-primary', b === btn));

    const showUrl = (src) => container.replaceChildren(frame(src));

    async function playServer(index, btn) {
      markActive(btn);
      container.replaceChildren(status(`Memuat ${ep.server[index].title}…`));
      try {
        const url = await getServerUrl(ep.server[index].serverId, { signal });
        if (signal?.aborted) return false;
        showUrl(url);
        return true;
      } catch (err) {
        if (signal?.aborted) return false;
        container.replaceChildren(errorState('Server ini gagal dimuat', `${err.message} Coba server lain.`, () => playServer(index, btn)));
        return false;
      }
    }

    if (serverBar) {
      if (ep.defaultStreamingUrl) {
        const btn = el('button', { type: 'button', class: 'btn server-btn' }, 'Utama');
        btn.addEventListener('click', () => { markActive(btn); showUrl(ep.defaultStreamingUrl); });
        buttons.push(btn);
      }
      ep.server.forEach((s, i) => {
        const btn = el('button', { type: 'button', class: 'btn server-btn' }, s.title);
        btn.addEventListener('click', () => playServer(i, btn));
        buttons.push(btn);
      });
      if (buttons.length > 1) serverBar.append(...buttons);
    }

    if (ep.defaultStreamingUrl) {
      showUrl(ep.defaultStreamingUrl);
      markActive(buttons[0]);
      return { episode: ep };
    }

    // No default stream: walk the server list until one resolves to an embeddable URL.
    for (let i = 0; i < ep.server.length; i++) {
      if (await playServer(i, buttons[i])) return { episode: ep };
      if (signal?.aborted) return null;
    }
    throw new Error('Sumber video tidak tersedia dari server untuk episode ini.');
  } catch (err) {
    if (signal?.aborted) return null;
    clear(container);
    container.append(errorState('Gagal memuat video', err.message, () => mountPlayer(container, episodeId, { onMeta, signal, serverBar })));
    return null;
  }
}
