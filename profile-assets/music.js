/* Eight audio-driven ASCII bands and a native, keyboard-accessible volume slider. */
(() => {
  'use strict';
  const audio = document.getElementById('profile-music');
  const player = document.getElementById('ascii-player');
  const spectrum = document.getElementById('ascii-spectrum');
  const volume = document.getElementById('music-volume');
  const ticks = [...document.querySelectorAll('.volume-bars i')];
  const status = document.getElementById('music-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // This piano recording concentrates its useful spectrum below 2 kHz.
  const frequencies = [70, 110, 170, 250, 360, 520, 760, 1100, 1800];
  const levels = new Float32Array(8);
  const peaks = new Float32Array(8).fill(-70);
  const bands = Array.from({ length: 8 }, () => {
    const cell = document.createElement('span');
    cell.className = 'ascii-band';
    const ink = document.createElement('span');
    ink.textContent = '+\n|\n|\n|\n|';
    cell.append(ink);
    spectrum.append(cell);
    return ink;
  });
  let context, analyser, gain, bins, edges;
  const volumeKey = 'profile-music-volume';
  let initialStep = 4;
  try {
    const saved = localStorage.getItem(volumeKey);
    if (saved !== null && /^[0-6]$/.test(saved)) initialStep = Number(saved);
  } catch (_) { /* Storage may be unavailable; keep the default. */ }
  volume.value = String(initialStep);
  let frame = 0, previous = 0, operation = 0, starting = false, wanted = initialStep / 6;

  function stopDrawing() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }

  function draw(now) {
    if (audio.paused || audio.ended || !wanted || document.hidden || reduced.matches) return;
    const dt = Math.min(0.05, previous ? (now - previous) / 1000 : 1 / 60);
    previous = now;
    analyser.getFloatFrequencyData(bins);
    bands.forEach((band, i) => {
      let power = 0;
      for (let b = edges[i]; b < edges[i + 1]; b++) power += Math.pow(10, bins[b] / 10);
      const db = 10 * Math.log10(power / (edges[i + 1] - edges[i]));
      // Per-band envelopes keep piano overtones visible without animating silence.
      peaks[i] = Math.max(-75, db, peaks[i] - dt * 6);
      const floor = Math.max(-100, peaks[i] - 36);
      const target = Math.max(0, Math.min(1, (db - floor) / (peaks[i] - floor)));
      // Fast attack, softer release: continuous movement rather than five hard row jumps.
      const smoothing = 1 - Math.exp(-dt / (target > levels[i] ? 0.045 : 0.19));
      levels[i] += (target - levels[i]) * smoothing;
      band.style.transform = `translateY(${(25 * (1 - levels[i])).toFixed(2)}px)`;
    });
    frame = requestAnimationFrame(draw);
  }

  function refresh() {
    stopDrawing();
    const playing = !audio.paused && !audio.ended && wanted > 0;
    player.dataset.state = playing ? 'on' : 'off';
    if (!playing) {
      levels.fill(0);
      bands.forEach(band => { band.style.transform = 'translateY(25px)'; });
    } else if (reduced.matches || !analyser) {
      bands.forEach((band, i) => { band.style.transform = `translateY(${[20, 14, 8, 3, 8, 14, 18, 22][i]}px)`; });
    } else if (!document.hidden) {
      frame = requestAnimationFrame(draw);
    }
  }

  function paintVolume() {
    const step = Number(volume.value);
    ticks.forEach((tick, i) => tick.classList.toggle('is-lit', i < step));
    const label = step ? `音量 ${step} / 6 档` : '静音；调高音量开始播放';
    volume.setAttribute('aria-valuetext', label);
    volume.parentElement.title = label + '；点击或拖动调整';
  }

  function setGain() {
    if (gain) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(wanted, context.currentTime, 0.025);
    } else {
      audio.volume = wanted;
    }
  }

  async function startAudio() {
    if (starting) return;
    const current = ++operation;
    starting = true;
    player.setAttribute('aria-busy', 'true');
    status.textContent = '';
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!context && AudioContext) {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.35;
        bins = new Float32Array(analyser.frequencyBinCount);
        edges = frequencies.map(hz => Math.max(1, Math.min(bins.length, Math.round(hz * analyser.fftSize / context.sampleRate))));
        gain = context.createGain();
        gain.gain.value = wanted;
        context.createMediaElementSource(audio).connect(analyser);
        analyser.connect(gain);
        gain.connect(context.destination);
        audio.volume = 1;
      }
      setGain();
      await Promise.all([context?.resume(), audio.play()]);
      if (current !== operation) return;
      status.textContent = '音乐已开始播放';
      refresh();
    } catch (error) {
      if (current !== operation) return;
      audio.pause();
      paintVolume();
      status.textContent = '播放失败，请点击音量竖线重试。';
      refresh();
    } finally {
      if (current === operation) {
        starting = false;
        player.removeAttribute('aria-busy');
      }
    }
  }

  function changeVolume() {
    wanted = Number(volume.value) / 6;
    try { localStorage.setItem(volumeKey, volume.value); } catch (_) {}
    paintVolume();
    setGain();
    if (!wanted) {
      ++operation;
      starting = false;
      audio.pause();
      player.removeAttribute('aria-busy');
      status.textContent = '音乐已静音';
      refresh();
    } else if (audio.paused || (context && context.state !== 'running')) {
      startAudio();
    }
  }
  volume.addEventListener('input', changeVolume);
  // Align each visible stroke with its exact level, including during a drag.
  let pointer = null;
  function pointToVolume(event) {
    const firstTick = ticks[0].getBoundingClientRect();
    const lastTick = ticks[ticks.length - 1].getBoundingClientRect();
    const first = firstTick.left + firstTick.width / 2;
    const last = lastTick.left + lastTick.width / 2;
    volume.value = String(event.clientX < volume.getBoundingClientRect().left + 3 ? 0 : Math.max(1, Math.min(6,
      1 + Math.round((event.clientX - first) / (last - first) * 5))));
    changeVolume();
  }
  volume.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointer = event.pointerId;
    volume.parentElement.dataset.pointerFocus = '';
    volume.focus({ preventScroll: true });
    volume.setPointerCapture(pointer);
    pointToVolume(event);
  });
  volume.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) pointToVolume(event);
  });
  volume.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    pointToVolume(event);
    volume.releasePointerCapture(pointer);
    pointer = null;
  });
  volume.addEventListener('lostpointercapture', () => { pointer = null; });
  volume.addEventListener('keydown', () => { delete volume.parentElement.dataset.pointerFocus; });
  volume.addEventListener('blur', () => { delete volume.parentElement.dataset.pointerFocus; });
  // Clicking the current value must also be able to resume after interruption.
  volume.addEventListener('click', changeVolume);
  audio.addEventListener('playing', refresh);
  audio.addEventListener('pause', refresh);
  audio.addEventListener('ended', refresh);
  audio.addEventListener('waiting', stopDrawing);
  audio.addEventListener('error', () => {
    audio.pause();
    refresh();
    status.textContent = '音乐加载失败，请点击音量竖线重试。';
  });
  document.addEventListener('visibilitychange', refresh);
  reduced.addEventListener('change', refresh);
  window.addEventListener('pagehide', () => { ++operation; starting = false; audio.pause(); stopDrawing(); });
  paintVolume();
  refresh();
  // A blocked autoplay keeps the chosen volume and retries on user interaction.
  const resumeOnGesture = () => {
    if (wanted && (audio.paused || (context && context.state !== 'running'))) startAudio();
  };
  document.addEventListener('pointerup', resumeOnGesture);
  document.addEventListener('keydown', resumeOnGesture);
  if (wanted) {
    setGain();
    audio.play().then(() => { if (wanted) startAudio(); }).catch(() => {
      if (wanted) status.textContent = '点击页面或按键后开始播放音乐';
    });
  }
})();
