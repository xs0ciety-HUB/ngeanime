export async function mountPlayer(container, videoUrl) {
  container.innerHTML = '<div class="state"><p>Memuat pemutar video...</p></div>';

  if (!videoUrl) {
    container.innerHTML = '<div class="state"><p>Sumber video tidak tersedia untuk episode ini.</p></div>';
    return;
  }

  if (videoUrl.includes('.m3u8')) {
    const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js');
    if (Hls.isSupported()) {
      const video = document.createElement('video');
      video.controls = true;
      video.style.width = '100%';
      video.style.height = '100%';
      container.innerHTML = '';
      container.appendChild(video);
      const hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          container.innerHTML = '<div class="state"><p>Gagal memuat stream HLS. Server mungkin tidak tersedia.</p></div>';
        }
      });
    } else {
      const video = document.createElement('video');
      video.controls = true;
      video.src = videoUrl;
      container.innerHTML = '';
      container.appendChild(video);
    }
  } else {
    const video = document.createElement('video');
    video.controls = true;
    video.src = videoUrl;
    video.style.width = '100%';
    video.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(video);
    video.addEventListener('error', () => {
      container.innerHTML = '<div class="state"><p>Gagal memutar video. Format mungkin tidak didukung.</p></div>';
    });
  }
}