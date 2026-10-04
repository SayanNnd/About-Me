/* =========================================================================
   music.js
   Synchronized music player for portfolio & blog.
   Uses localStorage to seamlessly persist playback position across page transitions.
   ========================================================================= */
(() => {
  'use strict';

  const STORAGE_KEY = 'sayan_portfolio_music_state';
  const isBlog = window.location.pathname.toLowerCase().includes('/blog/');
  const musicPrefix = isBlog ? '../music/' : 'music/';

  const TRACKS = [
    { title: 'Beneath the Mask', artist: 'Lyn', file: 'Beneath the Mask -rain- - Lyn.mp3' },
    { title: 'Color Your Night', artist: 'Lotus Juice', file: 'Color Your Night - Lotus Juice.mp3' },
    { title: 'Heaven', artist: 'Shihoko Hirata', file: 'Heaven - Shihoko Hirata.mp3' },
    { title: 'Rivers In the Desert', artist: 'Lyn', file: 'Rivers In the Desert - Lyn.mp3' },
    { title: 'City of Tears', artist: 'Christopher Larkin', file: 'City of Tears - Christopher Larkin.mp3' },
    { title: '14.3 Billion Years', artist: 'Andrew Prahlow', file: '14.3 Billion Years - Andrew Prahlow.mp3' },
    { title: 'Ghosts Of Reach', artist: 'XboxChamp33Music', file: "Martin O'Donnell - Ghosts Of Reach - XboxChamp33Music.mp3" },
    { title: 'Radio', artist: 'Bershy', file: 'Bershy - Radio (Lyrics) Dispatch Song - NewMelody.mp3' },
    { title: 'Evangelion Finally', artist: 'Milan Records USA', file: "KOMM, SUSSER TOD M-10 Director's Edit Version  Evangelion Finally - Milan Records USA.mp3" },
  ].map((t) => ({
    ...t,
    src: musicPrefix + t.file,
    slug: t.file.replace(/\.[^.]+$/, '').toLowerCase(),
  }));

  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 0.6;
  let current = -1;
  let lastSave = 0;
  const listeners = new Set();

  function notify() {
    renderWidget();
    listeners.forEach((fn) => {
      try { fn(getState()); } catch (e) { console.error(e); }
    });
  }

  function getState() {
    return {
      index: current,
      time: audio.currentTime || 0,
      paused: audio.paused,
      volume: audio.volume,
      title: current >= 0 ? TRACKS[current].title : '',
      artist: current >= 0 ? TRACKS[current].artist : '',
      updatedAt: Date.now(),
    };
  }

  function saveState(overridePaused) {
    if (current < 0) return;
    try {
      const st = {
        index: current,
        time: audio.currentTime || 0,
        paused: typeof overridePaused === 'boolean' ? overridePaused : audio.paused,
        volume: audio.volume,
        updatedAt: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch (_) { /* storage restricted */ }
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function renderWidget() {
    const el = document.getElementById('now');
    if (!el) return;

    if (current < 0) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }

    el.hidden = false;

    const paused = audio.paused;

    // Preserve the slider's focus so dragging doesn't stutter
    const hadSliderFocus = document.activeElement?.id === 'vol-slider';

    el.replaceChildren();

    const titleSpan = document.createElement('span');
    titleSpan.className = 't';
    titleSpan.textContent = `${paused ? '\u275A\u275A' : '\u266A'} ${TRACKS[current].title}`;

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'cmdlink';
    playBtn.textContent = paused ? 'play' : 'pause';
    playBtn.addEventListener('click', () => {
      if (audio.paused) resume();
      else pause();
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'cmdlink';
    nextBtn.textContent = 'next';
    nextBtn.addEventListener('click', () => next());

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'cmdlink';
    stopBtn.textContent = 'stop';
    stopBtn.addEventListener('click', () => stop());

    // ── Volume slider ──────────────────────────────────────────────
    const volWrap = document.createElement('span');
    volWrap.className = 'vol-wrap';

    const volIcon = document.createElement('span');
    volIcon.className = 'vol-icon';
    volIcon.setAttribute('aria-hidden', 'true');
    volIcon.textContent = audio.volume === 0 ? '🔇' : audio.volume < 0.4 ? '🔈' : audio.volume < 0.75 ? '🔉' : '🔊';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = 'vol-slider';
    slider.className = 'vol-slider';
    slider.min = '0';
    slider.max = '100';
    slider.step = '1';
    slider.value = Math.round(audio.volume * 100);
    slider.setAttribute('aria-label', 'Volume');
    // Update the CSS custom property for the fill track
    slider.style.setProperty('--vol', `${slider.value}%`);

    slider.addEventListener('input', () => {
      const v = Number(slider.value) / 100;
      setVolume(v);
      slider.style.setProperty('--vol', `${slider.value}%`);
      volIcon.textContent = v === 0 ? '🔇' : v < 0.4 ? '🔈' : v < 0.75 ? '🔉' : '🔊';
    });

    volWrap.append(volIcon, slider);
    el.append(titleSpan, playBtn, nextBtn, stopBtn, volWrap);

    if (hadSliderFocus) slider.focus();
  }

  function playIndex(i, seekTime = 0, shouldPlay = true) {
    if (i < 0 || i >= TRACKS.length) return Promise.reject(new Error('Invalid index'));
    current = i;
    const track = TRACKS[i];
    audio.src = track.src;

    if (seekTime > 0) {
      audio.currentTime = seekTime;
    }

    saveState(!shouldPlay);
    notify();

    if (!shouldPlay) {
      audio.pause();
      return Promise.resolve();
    }

    return audio.play().catch((err) => {
      notify();
      // If browser blocked autoplay, prepare click-to-resume listener
      if (err && err.name === 'NotAllowedError') {
        const unlock = () => {
          audio.play().catch(() => {});
          document.removeEventListener('click', unlock);
          document.removeEventListener('keydown', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });
      }
      throw err;
    });
  }

  function resume() {
    if (current < 0) {
      return playIndex(0);
    }
    return audio.play().catch((err) => {
      notify();
      throw err;
    });
  }

  function pause() {
    if (current < 0) return;
    audio.pause();
    saveState(true);
    notify();
  }

  function stop() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    current = -1;
    saveState(true);
    notify();
  }

  function next() {
    if (!TRACKS.length) return;
    const target = (current + 1) % TRACKS.length;
    return playIndex(target);
  }

  function prev() {
    if (!TRACKS.length) return;
    const target = current <= 0 ? TRACKS.length - 1 : current - 1;
    return playIndex(target);
  }

  function setVolume(v) {
    const n = Math.max(0, Math.min(1, Number(v)));
    audio.volume = n;
    saveState();
  }

  function findTrack(query) {
    const q = query.trim().toLowerCase();
    if (/^\d+$/.test(q)) {
      const idx = Number(q) - 1;
      return idx >= 0 && idx < TRACKS.length ? idx : -1;
    }
    const exact = TRACKS.findIndex((t) => t.slug === q || t.title.toLowerCase() === q);
    if (exact >= 0) return exact;
    return TRACKS.findIndex((t) => t.slug.includes(q) || t.title.toLowerCase().includes(q));
  }

  /* Audio event listeners */
  audio.addEventListener('play', () => {
    saveState(false);
    notify();
  });

  audio.addEventListener('pause', () => {
    saveState(true);
    notify();
  });

  audio.addEventListener('ended', () => {
    next();
  });

  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastSave > 800) {
      lastSave = now;
      saveState();
    }
  });

  window.addEventListener('beforeunload', () => {
    saveState();
  });

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const remote = JSON.parse(e.newValue);
        // Sync volume silently (no re-save needed)
        if (typeof remote.volume === 'number' && remote.volume !== audio.volume) {
          audio.volume = Math.max(0, Math.min(1, remote.volume));
          // Update slider if it's visible
          const slider = document.getElementById('vol-slider');
          if (slider) {
            slider.value = Math.round(audio.volume * 100);
            slider.style.setProperty('--vol', `${slider.value}%`);
            const icon = slider.previousElementSibling;
            if (icon) {
              const v = audio.volume;
              icon.textContent = v === 0 ? '🔇' : v < 0.4 ? '🔈' : v < 0.75 ? '🔉' : '🔊';
            }
          }
        }
        if (remote.index !== current) {
          playIndex(remote.index, remote.time || 0, !remote.paused).catch(() => {});
        } else if (remote.paused !== audio.paused) {
          if (remote.paused) audio.pause();
          else audio.play().catch(() => {});
        }
      } catch (_) {}
    }
  });

  // Initialize on load from stored state or start fresh
  function init() {
    const saved = loadSavedState();
    if (saved && typeof saved.index === 'number' && saved.index >= 0 && saved.index < TRACKS.length) {
      let targetTime = Number(saved.time) || 0;
      if (!saved.paused && saved.updatedAt) {
        const elapsed = (Date.now() - saved.updatedAt) / 1000;
        targetTime += Math.max(0, elapsed);
      }
      if (typeof saved.volume === 'number') {
        audio.volume = saved.volume;
      }
      playIndex(saved.index, targetTime, !saved.paused).catch(() => {
        // Autoplay policy prevented immediate playback; UI is rendered so user can click play
        notify();
      });
    } else {
      // Pick random track on first visit
      const random = Math.floor(Math.random() * TRACKS.length);
      playIndex(random, 0, true).catch(() => {
        notify();
      });
    }
    renderWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.MusicPlayer = {
    tracks: TRACKS,
    audio,
    getIndex: () => current,
    getCurrentTrack: () => (current >= 0 ? TRACKS[current] : null),
    isPlaying: () => !audio.paused && current >= 0,
    playIndex,
    play: (query) => {
      if (!query && query !== 0) return resume();
      const idx = findTrack(String(query));
      return idx >= 0 ? playIndex(idx) : Promise.reject(new Error('Track not found'));
    },
    resume,
    pause,
    stop,
    next,
    prev,
    setVolume,
    getVolume: () => Math.round(audio.volume * 100),
    findTrack,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();
