// loop.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Loop selection/enforcement, BPM detection, loop editor popup.
import { audio, hooks, loopButton, loopStatus, runtime, state } from "./core.js";
import { clamp, formatTime } from "./utils.js";
import { clearHistory } from "./renderer.js";
import { getTrackDuration, syncPlaybackTimeline } from "./playback.js";

export function getLoopBeatDuration(bpm = state.loopBpm) {
  return bpm > 0 ? 60 / bpm : 0;
}

export function getLoopBarDuration(bpm = state.loopBpm) {
  return getLoopBeatDuration(bpm) * 4;
}

export function getSelectedLoopRange() {
  const duration = getTrackDuration();

  if (!state.loopReady || duration <= 0) {
    return { start: 0, end: duration, duration };
  }

  const start = clamp(Number(state.loopStart) || 0, 0, duration);
  const end = clamp(
    Number(state.loopEnd) || duration,
    start,
    duration
  );

  return {
    start,
    end,
    duration: Math.max(0, end - start)
  };
}

export function hasPartialLoopSelection() {
  const trackDuration = getTrackDuration();
  const range = getSelectedLoopRange();

  return Boolean(
    state.loopReady &&
    range.duration > 0.01 &&
    range.duration < trackDuration - 0.01
  );
}

export function updateAudioLoopMode() {
  audio.loop = Boolean(state.audioLoop && !hasPartialLoopSelection());
}

export function setLoopStatus(message, tone = "idle") {
  loopStatus.textContent = message;
  loopStatus.dataset.tone = tone;
}

export function syncLoopButton() {
  const duration = getTrackDuration();
  const range = getSelectedLoopRange();
  const enabled = Boolean(state.loopReady && runtime.decodedAudioBuffer && duration > 0);
  const active = Boolean(enabled && state.audioLoop && hasPartialLoopSelection());

  loopButton.disabled = !enabled;
  loopButton.textContent = "Loop";
  loopButton.classList.toggle("loop-active", active);
  loopButton.setAttribute("aria-pressed", String(active));

  if (!enabled) {
    setLoopStatus("Load and analyze audio to create a loop.", "idle");
  } else if (!state.audioLoop) {
    setLoopStatus("Loop off.", "idle");
  } else if (active) {
    setLoopStatus(
      `Loop on · ${formatTime(range.start)}–${formatTime(range.end)} · ${range.duration.toFixed(2)} s`,
      "active"
    );
  } else {
    setLoopStatus("Full-track loop enabled.", "active");
  }
}

export function buildLoopWaveformPeaks(buffer) {
  if (!buffer || buffer.length <= 0) {
    return null;
  }

  const peakCount = 4096;
  const peaks = new Float32Array(peakCount);
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channelIndex) => buffer.getChannelData(channelIndex)
  );
  const samplesPerPeak = Math.max(1, buffer.length / peakCount);

  for (let peakIndex = 0; peakIndex < peakCount; peakIndex++) {
    const start = Math.floor(peakIndex * samplesPerPeak);
    const end = Math.min(
      buffer.length,
      Math.max(start + 1, Math.floor((peakIndex + 1) * samplesPerPeak))
    );
    const stride = Math.max(1, Math.floor((end - start) / 192));
    let peak = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += stride) {
      for (const channel of channels) {
        peak = Math.max(peak, Math.abs(channel[sampleIndex] || 0));
      }
    }

    peaks[peakIndex] = peak;
  }

  return peaks;
}

export function initializeLoopSelection(buffer) {
  const duration = buffer?.duration || 0;

  state.loopReady = duration > 0;
  state.audioLoop = false;
  state.loopStart = 0;
  state.loopEnd = Math.min(
    duration,
    Math.max(
      0.05,
      getLoopBarDuration(state.loopBpm) * state.loopBars
    )
  );
  state.loopSnap = true;
  runtime.loopWaveformPeaks = buildLoopWaveformPeaks(buffer);
  updateAudioLoopMode();
  syncLoopButton();
}

export function applyAudioLoopToVisualizer(start, end, options = {}) {
  const duration = getTrackDuration();

  if (!state.loopReady || duration <= 0) {
    return;
  }

  const nextStart = clamp(Number(start) || 0, 0, duration);
  const nextEnd = clamp(
    Number(end) || duration,
    nextStart,
    duration
  );

  state.loopStart = nextStart;
  state.loopEnd = nextEnd;
  state.loopBpm = clamp(
    Number(options.bpm) || state.loopBpm || 125,
    40,
    300
  );
  state.loopBars = Math.max(
    1,
    Math.round(Number(options.bars) || state.loopBars || 1)
  );
  state.loopSnap = options.snap !== undefined
    ? Boolean(options.snap)
    : state.loopSnap;
  state.audioLoop = nextEnd - nextStart > 0.01;

  updateAudioLoopMode();

  if (
    state.audioLoop &&
    (audio.currentTime < nextStart || audio.currentTime >= nextEnd)
  ) {
    audio.currentTime = nextStart;
    runtime.nextCaptureAudioTime = nextStart;
    clearHistory();
  }

  syncPlaybackTimeline(audio.currentTime || nextStart);
  syncLoopButton();
}

export function clearAudioLoopFromVisualizer() {
  const duration = getTrackDuration();

  state.audioLoop = false;
  state.loopStart = 0;
  state.loopEnd = duration;
  audio.loop = false;
  syncPlaybackTimeline(audio.currentTime);
  syncLoopButton();
}

export function enforceSelectedLoop() {
  if (
    !state.audioLoop ||
    !hasPartialLoopSelection() ||
    audio.paused ||
    audio.ended ||
    runtime.loopWrapPending
  ) {
    return;
  }

  const range = getSelectedLoopRange();

  if (
    audio.currentTime < range.start - 0.03 ||
    audio.currentTime >= range.end - 0.012
  ) {
    const overflow = audio.currentTime >= range.end
      ? Math.max(0, audio.currentTime - range.end)
      : 0;
    const wrappedTime = clamp(
      range.start + overflow,
      range.start,
      Math.max(range.start, range.end - 0.001)
    );

    runtime.loopWrapPending = true;
    audio.currentTime = wrappedTime;
    window.setTimeout(() => {
      runtime.loopWrapPending = false;
    }, 160);
    runtime.nextCaptureAudioTime = wrappedTime;
    syncPlaybackTimeline(wrappedTime);
    clearHistory();
  }
}

export async function detectLoopBpm(buffer) {
  if (!buffer) {
    throw new Error("No decoded audio is available.");
  }

  const sampleRate = buffer.sampleRate;
  const maxLength = Math.min(buffer.length, Math.floor(sampleRate * 90));
  const monoBuffer = new AudioBuffer({
    length: maxLength,
    numberOfChannels: 1,
    sampleRate
  });
  const mono = monoBuffer.getChannelData(0);

  for (
    let channelIndex = 0;
    channelIndex < buffer.numberOfChannels;
    channelIndex++
  ) {
    const channel = buffer.getChannelData(channelIndex);

    for (let index = 0; index < maxLength; index++) {
      mono[index] += channel[index] || 0;
    }
  }

  if (buffer.numberOfChannels > 1) {
    const scale = 1 / buffer.numberOfChannels;

    for (let index = 0; index < maxLength; index++) {
      mono[index] *= scale;
    }
  }

  const OfflineContext = window.OfflineAudioContext ||
    window.webkitOfflineAudioContext;
  let filtered = mono;

  if (OfflineContext) {
    const offline = new OfflineContext(1, maxLength, sampleRate);
    const source = offline.createBufferSource();
    const lowPass = offline.createBiquadFilter();

    source.buffer = monoBuffer;
    lowPass.type = "lowpass";
    lowPass.frequency.value = 180;
    lowPass.Q.value = 0.8;
    source.connect(lowPass);
    lowPass.connect(offline.destination);
    source.start();

    const rendered = await offline.startRendering();
    filtered = rendered.getChannelData(0);
  }

  const hopSize = 512;
  const frameCount = Math.max(1, Math.floor(filtered.length / hopSize));
  const energy = new Float32Array(frameCount);
  let maximumEnergy = 0;

  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    const offset = frame * hopSize;

    for (let index = 0; index < hopSize; index++) {
      const sample = filtered[offset + index] || 0;
      sum += sample * sample;
    }

    energy[frame] = sum;
    maximumEnergy = Math.max(maximumEnergy, sum);
  }

  if (maximumEnergy <= 1e-12) {
    throw new Error("The audio does not contain enough rhythmic energy.");
  }

  for (let index = 0; index < energy.length; index++) {
    energy[index] /= maximumEnergy;
  }

  const framesPerSecond = sampleRate / hopSize;
  const minimumLag = Math.max(
    2,
    Math.floor((framesPerSecond * 60) / 200)
  );
  const maximumLag = Math.min(
    frameCount - 1,
    Math.ceil((framesPerSecond * 60) / 60)
  );
  let bestLag = minimumLag;
  let bestCorrelation = -Infinity;

  for (let lag = minimumLag; lag <= maximumLag; lag++) {
    let correlation = 0;
    const limit = frameCount - lag;

    for (let index = 0; index < limit; index++) {
      correlation += energy[index] * energy[index + lag];
    }

    correlation /= Math.max(1, limit);

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }

    if (lag % 32 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  let bpm = (60 * framesPerSecond) / bestLag;

  while (bpm < 80) bpm *= 2;
  while (bpm > 160) bpm /= 2;

  return Math.round(bpm);
}

export const loopModalController = (() => {
  // ── BPM Detective popup — fully integrated with the main visualizer ──

  // ── Popup-local state ──
  let popupOpen      = false;
  let popupCtx       = null;
  let popupGain      = null;
  let popupBuffer    = null;
  let popupSource    = null;
  let popupIsPlaying = false;
  let popupLoopOn    = true;
  let popupVolume    = 80;
  let popupMuted     = false;
  let popupOffset    = 0;
  let popupCtxStart  = 0;
  let popupBpm       = 120;
  let popupLoopBars  = 4;
  let popupLoopStart = 0;
  let popupLoopEnd   = 4;
  let popupZoomStart = 0;
  let popupZoomEnd   = 1;
  let popupPeaks     = null;
  let popupAnimRaf   = null;
  let popupResizeObs = null;
  let popupForceRestartFromLoopStart = true;
  let popupDocMouseMoveHandler = null;
  let popupDocMouseUpHandler = null;
  let popupDocKeydownHandler = null;
  // Canvas dims
  let cW = 0, cH = 0, mmW = 0, mmH = 0;
  // Drag state
  let dragging = null, dragX0 = 0, dragVal0 = 0, dragMoved = false;
  let dragLoopDuration = 0, dragLoopStart0 = 0;
  let mmDrag = false, mmX0 = 0, mmZS0 = 0, mmZE0 = 0;

  // ── Entry point ──
  function openLoopPopup() {
  if (popupOpen || !state.loopReady || !runtime.decodedAudioBuffer) return;
  popupOpen = true;
  popupIsPlaying = false;
  popupSource = null;
  popupVolume = clamp(state.volume * 100, 0, 100);
  popupMuted = Boolean(state.muted);
  popupBpm = clamp(state.loopBpm || 120, 40, 300);
  popupLoopBars = Math.max(1, Math.round(state.loopBars || 4));

  if (audio) {
      try { audio.pause(); } catch (_) {}
  }
  const mainPlayBtn = document.getElementById('playButton');
  if (mainPlayBtn) {
      mainPlayBtn.textContent = '▶ Play';
  }

  const overlay = document.createElement('div');
  overlay.id = 'loop-modal-overlay';
  overlay.tabIndex = -1;
  overlay.innerHTML = buildPopupHTML();
  document.body.appendChild(overlay);
  overlay.focus();

  // Wire up all popup events
  wirePopupEvents(overlay);
  const popupQuery = id => overlay.querySelector("#" + id);
  popupQuery("popup-vol-slider").value = String(popupVolume);
  popupQuery("popup-vol-pct").textContent = `${popupVolume}%`;
  refreshVolSlider(popupQuery);
  updateVolIcon(popupQuery);
  popupQuery("popup-bars-val").value = String(popupLoopBars);

  // Load and decode audio from state
  initPopupAudio(runtime.decodedAudioBuffer);
  }

  // ── HTML builder ──
  function buildPopupHTML() {
  return `
  <div class="loop-modal-panel" id="loop-panel">
<div class="loop-header">
  <div class="loop-title">Loop Region</div>
  <button class="loop-close-btn" id="popup-close-btn" title="Close">✕</button>
</div>

<div class="loop-wave-section">
  <div class="loop-wave-header">
    <span class="loop-section-label">Waveform · Loop Region</span>
    <div class="loop-zoom-controls">
      <button class="loop-zoom-btn" id="popup-zoom-out">−</button>
      <span class="loop-zoom-level" id="popup-zoom-level">1×</span>
      <button class="loop-zoom-btn" id="popup-zoom-in">+</button>
      <button class="loop-zoom-btn loop-fit-btn" id="popup-zoom-fit">FIT</button>
    </div>
  </div>

  <div class="loop-waveform-wrap" id="popup-wave-wrap">
    <div class="loop-wave-clip">
      <canvas id="popup-wave-canvas"></canvas>
      <div id="popup-playhead"></div>
    </div>
    <div class="popup-lhandle" id="popup-h-left" style="left:0%">
      <div class="popup-handle-tag" id="popup-tag-left">0.00s</div>
      <div class="popup-handle-knob"></div>
    </div>
    <div class="popup-lhandle" id="popup-h-right" style="left:50%">
      <div class="popup-handle-tag" id="popup-tag-right">4.00s</div>
      <div class="popup-handle-knob"></div>
    </div>
    <div class="loop-analyzing" id="popup-analyzing">
      <div class="loop-dots"><span></span><span></span><span></span></div>
      <div class="loop-analyzing-text">Analysing audio…</div>
    </div>
  </div>

  <div class="loop-minimap-wrap" id="popup-minimap-wrap">
    <canvas id="popup-minimap-canvas"></canvas>
  </div>

  <div class="loop-progress-wrap" id="popup-progress-wrap">
    <div class="loop-progress-fill" id="popup-progress-fill"></div>
  </div>
  <div class="loop-time-row">
    <span class="loop-time-mono" id="popup-t-current">0:00.000</span>
    <span class="loop-time-mono" id="popup-t-total">0:00.000</span>
  </div>
</div>

<div class="loop-controls-section">
  <div class="loop-ctrl-block">
    <div class="loop-transport-row">
      <button class="loop-tbtn" id="popup-play-btn" disabled>▶ Play</button>
      <button class="loop-tbtn" id="popup-stop-btn" disabled>■ Stop</button>
      <div class="loop-pill">
        <div class="loop-pill-switch on" id="popup-loop-switch"></div>
        <span class="loop-pill-label">Loop</span>
      </div>
    </div>
    <div class="loop-option-row">
      <label class="loop-check-label">
        <input type="checkbox" id="popup-force-start-toggle" class="loop-check-input" checked>
        <span class="loop-check-box"></span>
        <span class="loop-check-text">Always start preview from loop start</span>
      </label>
    </div>
    <div class="loop-volume-row">
      <button class="loop-vol-btn" id="popup-mute-btn">🔊</button>
      <input class="loop-vol-slider" id="popup-vol-slider" type="range" min="0" max="100" value="80">
      <span class="loop-vol-pct" id="popup-vol-pct">80%</span>
    </div>
  </div>

  <div class="loop-ctrl-block loop-bpm-block">
    <div class="loop-section-label">Detected Tempo</div>
    <div class="loop-bpm-row">
      <input class="loop-bpm-input" id="popup-bpm-input" type="number" min="40" max="300" placeholder="—" disabled>
      <span class="loop-bpm-unit">BPM</span>
    </div>
    <div class="loop-bpm-hint">Click to edit · Enter to confirm</div>
  </div>

  <div class="loop-ctrl-block loop-bars-block">
    <div class="loop-section-label">Loop Length</div>
    <div class="loop-bars-row">
      <button class="loop-bar-btn" id="popup-bars-decr">−</button>
      <input class="loop-bars-val" id="popup-bars-val" type="number" min="1" max="999" value="4">
      <span class="loop-bars-unit">bars</span>
      <button class="loop-bar-btn" id="popup-bars-incr">+</button>
    </div>
    <div class="loop-time-info" id="popup-loop-time-info">—</div>
  </div>
</div>

<div class="loop-status-bar">
  <span class="loop-stat">Rate: <b id="popup-stat-rate">—</b></span>
  <span class="loop-stat">Duration: <b id="popup-stat-dur">—</b></span>
  <span class="loop-stat">Loop: <b id="popup-stat-loop">—</b></span>
  <span class="loop-stat">Beat: <b id="popup-stat-beat">—</b></span>
</div>

<div class="loop-action-row">
  <button class="loop-action-btn loop-cancel-btn" id="popup-cancel-btn">Cancel</button>
  <button class="loop-action-btn loop-clear-btn" id="popup-clear-btn">Clear Loop</button>
  <button class="loop-action-btn loop-apply-btn" id="popup-apply-btn" disabled>Apply Loop</button>
</div>
  </div>`;
  }

  // ── Wire all popup events ──
  function wirePopupEvents(overlay) {
  const $ = id => overlay.querySelector('#' + id);

  // Close
  $('popup-close-btn').addEventListener('click', closePopup);
  $('popup-cancel-btn').addEventListener('click', closePopup);

  // Clear loop
  $('popup-clear-btn').addEventListener('click', () => {
      clearAudioLoop();
      closePopup();
  });

  // Apply loop
  $('popup-apply-btn').addEventListener('click', () => {
      applyAudioLoop(popupLoopStart, popupLoopEnd);
      state.loopBpm = popupBpm;
      const btn = document.getElementById('loopButton');
      if (btn) {
          btn.textContent = 'Loop';
          btn.classList.add('loop-active');
      }
      closePopup();
  });

  // Transport
  $('popup-play-btn').addEventListener('click', () => popupIsPlaying ? popupPause() : popupPlay($));
  $('popup-stop-btn').addEventListener('click', () => popupStop($));
  $('popup-loop-switch').addEventListener('click', () => {
      popupLoopOn = !popupLoopOn;
      $('popup-loop-switch').classList.toggle('on', popupLoopOn);
      if (popupSource && popupIsPlaying) { popupSource.loop = popupLoopOn; if (popupLoopOn) { popupSource.loopStart = popupLoopStart; popupSource.loopEnd = popupLoopEnd; } }
  });
  $('popup-force-start-toggle').checked = popupForceRestartFromLoopStart;
  $('popup-force-start-toggle').addEventListener('change', () => {
      popupForceRestartFromLoopStart = $('popup-force-start-toggle').checked;
  });

  // Volume
  $('popup-vol-slider').addEventListener('input', () => {
      popupVolume = +$('popup-vol-slider').value;
      $('popup-vol-pct').textContent = popupVolume + '%';
      if (!popupMuted && popupGain) popupGain.gain.value = popupMuted ? 0 : popupVolume / 100;
      refreshVolSlider($);
  });
  $('popup-mute-btn').addEventListener('click', () => {
      popupMuted = !popupMuted;
      if (popupGain) popupGain.gain.value = popupMuted ? 0 : popupVolume / 100;
      updateVolIcon($);
  });

  // BPM
  $('popup-bpm-input').addEventListener('blur', () => commitBPM($));
  $('popup-bpm-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('popup-bpm-input').blur(); });

  // Bars
  $('popup-bars-val').addEventListener('blur', () => commitBars($));
  $('popup-bars-val').addEventListener('keydown', e => { if (e.key === 'Enter') $('popup-bars-val').blur(); });
  $('popup-bars-decr').addEventListener('click', () => {
      popupLoopBars = Math.max(1, popupLoopBars - 1);
      $('popup-bars-val').value = popupLoopBars;
      applyLoopChange($);
  });
  $('popup-bars-incr').addEventListener('click', () => {
      const maxBars = getMaxLoopBars();
      popupLoopBars = Math.min(maxBars, popupLoopBars + 1);
      $('popup-bars-val').value = popupLoopBars;
      applyLoopChange($);
  });

  // Zoom
  $('popup-zoom-in').addEventListener('click',  () => zoomAtX(cW / 2, 2, $));
  $('popup-zoom-out').addEventListener('click', () => zoomAtX(cW / 2, 0.5, $));
  $('popup-zoom-fit').addEventListener('click', () => { if (popupBuffer) setZoomWindow(0, popupBuffer.duration, $); });

  // Wave click to seek
  $('popup-wave-wrap').addEventListener('click', e => {
      if (dragMoved) { dragMoved = false; return; }
      if (!popupBuffer) return;
      const rect = $('popup-wave-wrap').getBoundingClientRect();
      seekTo(xToTime(e.clientX - rect.left), $);
  });

  // Wheel zoom
  $('popup-wave-wrap').addEventListener('wheel', e => {
      if (!popupBuffer) return;
      e.preventDefault();
      const rect = $('popup-wave-wrap').getBoundingClientRect();
      zoomAtX(e.clientX - rect.left, e.deltaY < 0 ? 1.6 : 0.625, $);
  }, { passive: false });

  // Progress click
  $('popup-progress-wrap').addEventListener('click', e => {
      if (!popupBuffer) return;
      const r = $('popup-progress-wrap').getBoundingClientRect();
      seekTo(((e.clientX - r.left) / r.width) * popupBuffer.duration, $);
  });

  // Handle drag — left
  $('popup-h-left').addEventListener('mousedown', e => { startHandleDrag('left', e, $); });
  $('popup-h-right').addEventListener('mousedown', e => { startHandleDrag('right', e, $); });
  $('popup-h-left').addEventListener('click', e => e.stopPropagation());
  $('popup-h-right').addEventListener('click', e => e.stopPropagation());

  // Minimap drag
  $('popup-minimap-wrap').addEventListener('mousedown', e => {
      if (!popupBuffer) return;
      const rect = $('popup-minimap-wrap').getBoundingClientRect();
      const x = e.clientX - rect.left;
      const vL = (popupZoomStart / popupBuffer.duration) * mmW;
      const vR = (popupZoomEnd   / popupBuffer.duration) * mmW;
      if (x < vL - 8 || x > vR + 8) {
          const ct = (x / mmW) * popupBuffer.duration, hw = (popupZoomEnd - popupZoomStart) / 2;
          setZoomWindow(ct - hw, ct + hw, $);
      }
      mmDrag = true; mmX0 = e.clientX; mmZS0 = popupZoomStart; mmZE0 = popupZoomEnd;
      e.preventDefault();
  });

  // Global handlers while popup is open
  popupDocMouseMoveHandler = e => onMouseMove(e, $);
  popupDocMouseUpHandler = () => onMouseUp($);
  document.addEventListener('mousemove', popupDocMouseMoveHandler);
  document.addEventListener('mouseup', popupDocMouseUpHandler);

  popupDocKeydownHandler = e => {
      if (!popupOpen) return;
      const active = document.activeElement;
      const editingInput = active && (active.id === 'popup-bpm-input' || active.id === 'popup-bars-val');
      if (editingInput && e.key !== 'Escape') return;

      if (e.key === ' ' || e.code === 'Space') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          popupIsPlaying ? popupPause() : popupPlay($);
          return;
      }
      if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          zoomAtX(cW / 2, 2, $);
          return;
      }
      if (e.key === '-') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          zoomAtX(cW / 2, 0.5, $);
          return;
      }
      if (e.key === '0' && popupBuffer) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setZoomWindow(0, popupBuffer.duration, $);
          return;
      }
      if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          closePopup();
      }
  };
  document.addEventListener('keydown', popupDocKeydownHandler, true);

  // Canvas resize observer
  popupResizeObs = new ResizeObserver(() => resizeCanvases($));
  popupResizeObs.observe(overlay.querySelector('#loop-panel'));
  setTimeout(() => resizeCanvases($), 60);
  }

  // ── Canvas resize ──
  function resizeCanvases($) {
  const wWrap = $('popup-wave-wrap');
  const mmWrap = $('popup-minimap-wrap');
  if (!wWrap || !mmWrap) return;
  const dpr = window.devicePixelRatio || 1;
  const wr = wWrap.getBoundingClientRect();
  const mr = mmWrap.getBoundingClientRect();
  cW = wr.width; cH = wr.height;
  const wc = $('popup-wave-canvas');
  wc.width = cW * dpr; wc.height = cH * dpr;
  wc.style.width = cW + 'px'; wc.style.height = cH + 'px';
  const wCtx = wc.getContext('2d'); wCtx.scale(dpr, dpr);
  mmW = mr.width; mmH = mr.height;
  const mc = $('popup-minimap-canvas');
  mc.width = mmW * dpr; mc.height = mmH * dpr;
  mc.style.width = mmW + 'px'; mc.style.height = mmH + 'px';
  const mCtx = mc.getContext('2d'); mCtx.scale(dpr, dpr);
  if (popupBuffer) buildPeaks();
  renderWaveform($); renderMinimap($);
  }

  // ── Init audio ──
  async function initPopupAudio(buffer) {
  const overlay = document.getElementById('loop-modal-overlay');
  if (!overlay) return;
  const $ = id => overlay.querySelector('#' + id);
  $('popup-analyzing').classList.add('show');

  try {
      popupCtx = new (window.AudioContext || window.webkitAudioContext)();
      popupGain = popupCtx.createGain();
      popupGain.gain.value = popupVolume / 100;
      popupGain.connect(popupCtx.destination);

      popupBuffer = buffer;

      $('popup-stat-rate').textContent = popupBuffer.sampleRate + ' Hz';
      $('popup-stat-dur').textContent  = fmtDur(popupBuffer.duration);
      $('popup-t-total').textContent   = fmtTime(popupBuffer.duration);

      // BPM detection
      popupBpm = await detectBPM(popupBuffer);
      $('popup-bpm-input').value = popupBpm;
      $('popup-bpm-input').disabled = false;
      $('popup-stat-beat').textContent = (60 / popupBpm).toFixed(3) + 's';

      // If existing loop in state, use it
      if (state.audioLoop && state.loopEnd > state.loopStart) {
          popupLoopStart = state.loopStart;
          popupLoopEnd   = state.loopEnd;
          if (state.loopBpm > 0) {
              popupBpm = state.loopBpm;
              $('popup-bpm-input').value = popupBpm;
              const bd = (60 / popupBpm) * 4;
              popupLoopBars = Math.max(1, Math.round((popupLoopEnd - popupLoopStart) / bd));
              $('popup-bars-val').value = popupLoopBars;
          }
      } else {
          popupLoopStart = 0;
          updateLoopEnd($);
      }

      popupZoomStart = 0;
      popupZoomEnd   = popupBuffer.duration;
      updateZoomDisplay($);

      buildPeaks();
      renderWaveform($); renderMinimap($);
      syncBarsLimit($);
      updateHandles($); updateLoopInfo($);

      $('popup-play-btn').disabled = false;
      $('popup-stop-btn').disabled = false;
      $('popup-apply-btn').disabled = false;
      popupOffset = popupLoopStart;

  } catch (err) {
      console.error('Popup audio init error:', err);
      $('popup-analyzing').querySelector('.loop-analyzing-text').textContent = 'Error decoding audio.';
      return;
  }
  $('popup-analyzing').classList.remove('show');
  }

  // ── BPM detection (same algorithm as bpm_detect.html) ──
  async function detectBPM(buf) {
  const sr = buf.sampleRate, maxLen = Math.min(buf.length, sr * 90);
  const mono = new Float32Array(maxLen);
  for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < maxLen; i++) mono[i] += ch[i];
  }
  if (buf.numberOfChannels > 1) for (let i = 0; i < maxLen; i++) mono[i] /= buf.numberOfChannels;

  const offCtx = new OfflineAudioContext(1, maxLen, sr);
  const ob = offCtx.createBuffer(1, maxLen, sr); ob.getChannelData(0).set(mono);
  const src = offCtx.createBufferSource(); src.buffer = ob;
  const lp = offCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.8;
  src.connect(lp); lp.connect(offCtx.destination); src.start(0);
  const rend = await offCtx.startRendering();
  const fd = rend.getChannelData(0);

  const hop = 512, nF = Math.floor(fd.length / hop);
  const eng = new Float32Array(nF);
  for (let i = 0; i < nF; i++) {
      let e = 0, off = i * hop;
      for (let j = 0; j < hop; j++) { const s = fd[off + j]; e += s * s; }
      eng[i] = e;
  }
  let eM = 0; for (let i = 0; i < nF; i++) if (eng[i] > eM) eM = eng[i];
  if (eM > 0) for (let i = 0; i < nF; i++) eng[i] /= eM;

  const fps = sr / hop, minL = Math.max(2, Math.floor(fps * 60 / 200)), maxL = Math.ceil(fps * 60 / 60);
  let bL = minL, bC = -Infinity;
  for (let lag = minL; lag <= maxL; lag++) {
      let c = 0; const lim = nF - lag;
      for (let i = 0; i < lim; i++) c += eng[i] * eng[i + lag];
      if (c > bC) { bC = c; bL = lag; }
  }
  let raw = 60 * fps / bL;
  while (raw < 80) raw *= 2; while (raw > 160) raw /= 2;
  return Math.round(raw);
  }

  // ── Peaks ──
  function buildPeaks() {
  if (!popupBuffer || cW < 1) return;
  const N = Math.ceil(cW * 4);
  popupPeaks = new Float32Array(N);
  const ch = popupBuffer.getChannelData(0);
  const blk = Math.floor(popupBuffer.length / N);
  for (let i = 0; i < N; i++) {
      let pk = 0, off = i * blk;
      for (let j = 0; j < blk; j++) { const a = Math.abs(ch[off + j] || 0); if (a > pk) pk = a; }
      popupPeaks[i] = pk;
  }
  }

  // ── Coordinates ──
  const timeToX = t => (popupZoomEnd > popupZoomStart) ? ((t - popupZoomStart) / (popupZoomEnd - popupZoomStart)) * cW : 0;
  const xToTime = x => (popupZoomEnd > popupZoomStart) ? popupZoomStart + (x / cW) * (popupZoomEnd - popupZoomStart) : 0;

  // ── Waveform render ──
  function renderWaveform($) {
  const wc = document.getElementById('popup-wave-canvas');
  if (!wc) return;
  const ctx = wc.getContext('2d');
  ctx.clearRect(0, 0, cW, cH);
  ctx.fillStyle = 'rgba(15,15,23,0.98)'; ctx.fillRect(0, 0, cW, cH);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, cH / 2); ctx.lineTo(cW, cH / 2); ctx.stroke();

  if (!popupPeaks || !popupBuffer) {
      ctx.fillStyle = 'rgba(168,168,182,0.72)'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('Loading…', cW / 2, cH / 2 + 4); return;
  }

  const lsX = timeToX(popupLoopStart), leX = timeToX(popupLoopEnd);
  ctx.fillStyle = 'rgba(154,154,165,0.10)'; ctx.fillRect(lsX, 0, leX - lsX, cH);

  // Beat grid
  if (popupBpm > 0) {
      const bd = 60 / popupBpm;
      let first = Math.floor(popupZoomStart / bd) * bd, bi = Math.round(first / bd);
      for (let t = first; t < popupZoomEnd; t += bd, bi++) {
          const x = timeToX(t), isBar = (bi % 4 === 0);
          ctx.strokeStyle = isBar ? 'rgba(154,154,165,0.32)' : 'rgba(154,154,165,0.12)';
          ctx.lineWidth = isBar ? 0.8 : 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH); ctx.stroke();
          if (isBar) {
              ctx.fillStyle = 'rgba(168,168,182,0.55)'; ctx.font = '8px monospace'; ctx.textAlign = 'left';
              ctx.fillText(Math.round(t / (bd * 4)) + 1, x + 2, 10);
          }
      }
  }

  // Waveform
  const N = popupPeaks.length, dur = popupBuffer.duration;
  const p0 = Math.floor((popupZoomStart / dur) * N), p1 = Math.ceil((popupZoomEnd / dur) * N);
  const sl = p1 - p0;
  for (let i = 0; i < cW; i++) {
      const pi = p0 + Math.round((i / cW) * sl);
      const pk = popupPeaks[Math.min(pi, N - 1)] || 0;
      const h = pk * cH * 0.88, y = (cH - h) / 2;
      const t = xToTime(i), inL = (t >= popupLoopStart && t <= popupLoopEnd);
      ctx.fillStyle = inL
          ? `rgb(${118 + pk * 55 | 0},${118 + pk * 55 | 0},${128 + pk * 55 | 0})`
          : `rgb(${48 + pk * 42 | 0},${48 + pk * 42 | 0},${58 + pk * 42 | 0})`;
      ctx.fillRect(i, y, 1, Math.max(0.5, h));
  }

  // Loop boundary lines
  ctx.strokeStyle = 'rgba(180,180,192,0.76)'; ctx.lineWidth = 1;
  [lsX, leX].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH); ctx.stroke(); });
  }

  // ── Minimap render ──
  function renderMinimap($) {
  const mc = document.getElementById('popup-minimap-canvas');
  if (!mc) return;
  const ctx = mc.getContext('2d');
  ctx.clearRect(0, 0, mmW, mmH);
  ctx.fillStyle = 'rgba(15,15,23,0.98)'; ctx.fillRect(0, 0, mmW, mmH);
  if (!popupPeaks || !popupBuffer) return;

  const N = popupPeaks.length, dur = popupBuffer.duration;
  for (let i = 0; i < mmW; i++) {
      const pi = Math.round((i / mmW) * N);
      const pk = popupPeaks[Math.min(pi, N - 1)] || 0;
      const h = pk * mmH * 0.85, y = (mmH - h) / 2;
      const t = (i / mmW) * dur, inL = (t >= popupLoopStart && t <= popupLoopEnd);
      ctx.fillStyle = inL ? `rgba(154,154,165,${0.42 + pk * 0.48})` : `rgba(74,74,86,${0.5 + pk * 0.38})`;
      ctx.fillRect(i, y, 1, Math.max(0.5, h));
  }

  const vL = (popupZoomStart / dur) * mmW, vR = (popupZoomEnd / dur) * mmW;
  ctx.fillStyle = 'rgba(154,154,165,0.10)'; ctx.fillRect(vL, 0, vR - vL, mmH);
  ctx.strokeStyle = 'rgba(180,180,192,0.72)'; ctx.lineWidth = 1;
  ctx.strokeRect(vL + 0.5, 0.5, Math.max(1, vR - vL - 1), mmH - 1);

  if (popupOffset > 0) {
      const px = (popupOffset / dur) * mmW;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, mmH); ctx.stroke();
  }
  }

  // ── Zoom ──
  function updateZoomDisplay($) {
  if (!popupBuffer) { $('popup-zoom-level').textContent = '1×'; return; }
  const z = popupBuffer.duration / (popupZoomEnd - popupZoomStart);
  $('popup-zoom-level').textContent = (z < 10 ? z.toFixed(1) : z.toFixed(0)) + '×';
  }

  function setZoomWindow(s, e, $) {
  if (!popupBuffer) return;
  const dur = popupBuffer.duration, minW = dur / 64;
  let sz = Math.max(minW, e - s);
  let ns = Math.max(0, s), ne = Math.min(dur, ns + sz);
  if (ne >= dur) { ne = dur; ns = Math.max(0, ne - sz); }
  popupZoomStart = ns; popupZoomEnd = ne;
  updateZoomDisplay($); updateHandles($); renderWaveform($); renderMinimap($);
  }

  function zoomAtX(canvasX, factor, $) {
  if (!popupBuffer) return;
  const anchor = xToTime(canvasX);
  const newW = Math.max(popupBuffer.duration / 64, Math.min(popupBuffer.duration, (popupZoomEnd - popupZoomStart) / factor));
  const rel = (anchor - popupZoomStart) / (popupZoomEnd - popupZoomStart);
  setZoomWindow(anchor - rel * newW, anchor - rel * newW + newW, $);
  }

  // ── Handles ──
  function updateHandles($) {
  if (!popupBuffer) return;
  $('popup-h-left').style.left  = (timeToX(popupLoopStart) / cW * 100).toFixed(3) + '%';
  $('popup-h-right').style.left = (timeToX(popupLoopEnd)   / cW * 100).toFixed(3) + '%';
  $('popup-tag-left').textContent  = fmtTime(popupLoopStart);
  $('popup-tag-right').textContent = fmtTime(popupLoopEnd);
  }

  function startHandleDrag(side, e, $) {
  dragging = side; dragMoved = false;
  dragX0 = (e.touches ? e.touches[0] : e).clientX;
  dragVal0 = popupLoopStart;
  dragLoopStart0 = popupLoopStart;
  dragLoopDuration = Math.max(0, popupLoopEnd - popupLoopStart);
  e.preventDefault(); e.stopPropagation();
  }

  function onMouseMove(e, $) {
  if (mmDrag && popupBuffer) {
      const dx = e.clientX - mmX0, dur = popupBuffer.duration;
      const dt = (dx / mmW) * dur;
      let ns = mmZS0 + dt, ne = mmZE0 + dt;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > dur) { ns -= (ne - dur); ne = dur; } ns = Math.max(0, ns);
      popupZoomStart = ns; popupZoomEnd = ne;
      updateZoomDisplay($); updateHandles($); renderWaveform($); renderMinimap($);
      return;
  }
  if (!dragging || !popupBuffer) return;
  dragMoved = true;
  const cx = (e.touches ? e.touches[0] : e).clientX;
  const wWrap = document.getElementById('popup-wave-wrap');
  if (!wWrap) return;
  const rect = wWrap.getBoundingClientRect();
  const dt = ((cx - dragX0) / rect.width) * (popupZoomEnd - popupZoomStart);
  const beat = popupBpm > 0 ? 60 / popupBpm : 0;
  const loopDuration = Math.max(0, dragLoopDuration || (popupLoopEnd - popupLoopStart));
  let ns = dragLoopStart0 + dt;
  if (beat > 0) ns = Math.round(ns / beat) * beat;
  const maxStart = Math.max(0, popupBuffer.duration - loopDuration);
  ns = Math.max(0, Math.min(ns, maxStart));
  popupLoopStart = ns;
  popupLoopEnd = Math.min(popupBuffer.duration, popupLoopStart + loopDuration);
  updateHandles($); renderWaveform($); renderMinimap($); updateLoopInfo($);
  if (popupIsPlaying && popupSource && popupLoopOn) {
      popupSource.loopStart = popupLoopStart; popupSource.loopEnd = popupLoopEnd;
  }
  }

  function onMouseUp($) {
  if (dragging) {
      if (dragMoved && popupIsPlaying) { popupPause(); popupPlay($); }
      dragging = null;
  } else { dragMoved = false; }
  mmDrag = false;
  }

  // ── Loop info ──
  function updateLoopInfo($) {
  if (!popupBuffer) return;
  $('popup-loop-time-info').textContent = `${popupLoopStart.toFixed(2)}s → ${popupLoopEnd.toFixed(2)}s · ${(popupLoopEnd - popupLoopStart).toFixed(3)}s`;
  $('popup-stat-loop').textContent = `${popupLoopStart.toFixed(2)}s – ${popupLoopEnd.toFixed(2)}s`;
  }

  function getLoopBarDuration() {
  return popupBpm > 0 ? (60 / popupBpm) * 4 : 0;
  }

  function getMaxLoopBars() {
  if (!popupBuffer) return 999;
  const barDur = getLoopBarDuration();
  if (barDur <= 0) return 999;
  return Math.max(1, Math.floor(((popupBuffer.duration - popupLoopStart) / barDur) + 1e-6));
  }

  function syncBarsLimit($) {
  const maxBars = getMaxLoopBars();
  const barsInput = $('popup-bars-val');
  popupLoopBars = Math.max(1, Math.min(popupLoopBars, maxBars));
  if (barsInput) {
      barsInput.max = String(maxBars);
      barsInput.value = popupLoopBars;
  }
  const decrBtn = $('popup-bars-decr');
  const incrBtn = $('popup-bars-incr');
  if (decrBtn) decrBtn.disabled = popupLoopBars <= 1;
  if (incrBtn) incrBtn.disabled = popupLoopBars >= maxBars;
  return maxBars;
  }

  function updateLoopEnd($) {
  if (!popupBuffer || popupBpm <= 0) return;
  syncBarsLimit($);
  const desiredDuration = Math.min(getLoopBarDuration() * popupLoopBars, popupBuffer.duration);
  if (popupLoopStart + desiredDuration > popupBuffer.duration) {
      popupLoopStart = Math.max(0, popupBuffer.duration - desiredDuration);
  }
  popupLoopEnd = Math.min(popupLoopStart + desiredDuration, popupBuffer.duration);
  }

  function applyLoopChange($) {
  updateLoopEnd($);
  syncBarsLimit($);
  updateHandles($); renderWaveform($); renderMinimap($); updateLoopInfo($);
  if (popupIsPlaying) { popupPause(); popupPlay($); }
  }

  function commitBPM($) {
  const v = +$('popup-bpm-input').value;
  if (v >= 40 && v <= 300) {
      popupBpm = v;
      $('popup-stat-beat').textContent = (60 / popupBpm).toFixed(3) + 's';
      applyLoopChange($);
  } else { $('popup-bpm-input').value = popupBpm; }
  }

  function commitBars($) {
  const maxBars = getMaxLoopBars();
  const v = parseInt($('popup-bars-val').value);
  if (!Number.isNaN(v) && v >= 1) {
      popupLoopBars = Math.min(maxBars, v);
      applyLoopChange($);
  } else {
      $('popup-bars-val').value = popupLoopBars;
  }
  }

  // ── Playback ──
  function popupPlay($) {
  if (!popupBuffer || !popupCtx) return;
  if (popupCtx.state === 'suspended') popupCtx.resume();
  if (popupForceRestartFromLoopStart) popupOffset = popupLoopStart;
  if (popupLoopOn && (popupOffset < popupLoopStart || popupOffset >= popupLoopEnd)) popupOffset = popupLoopStart;
  popupSource = popupCtx.createBufferSource();
  popupSource.buffer = popupBuffer;
  popupSource.connect(popupGain);
  if (popupLoopOn) { popupSource.loop = true; popupSource.loopStart = popupLoopStart; popupSource.loopEnd = popupLoopEnd; }
  popupSource.start(0, popupOffset);
  popupCtxStart = popupCtx.currentTime - popupOffset;
  popupIsPlaying = true;
  $('popup-play-btn').innerHTML = '⏸ Pause'; $('popup-play-btn').classList.add('playing');
  document.getElementById('popup-playhead').style.display = 'block';
  popupSource.onended = () => {
      if (!popupLoopOn && popupIsPlaying) {
          popupIsPlaying = false;
          $('popup-play-btn').innerHTML = '▶ Play'; $('popup-play-btn').classList.remove('playing');
      }
  };
  if (popupAnimRaf) cancelAnimationFrame(popupAnimRaf);
  popupAnimRaf = requestAnimationFrame(ts => animLoop(ts, $));
  }

  function popupPause() {
  if (!popupIsPlaying) return;
  popupOffset = getLiveTime();
  if (popupSource) { popupSource.onended = null; try { popupSource.stop(); } catch (_) {} popupSource = null; }
  popupIsPlaying = false;
  const el = document.getElementById('popup-play-btn');
  if (el) { el.innerHTML = '▶ Play'; el.classList.remove('playing'); }
  if (popupAnimRaf) { cancelAnimationFrame(popupAnimRaf); popupAnimRaf = null; }
  }

  function popupStop($) {
  if (popupSource) { popupSource.onended = null; try { popupSource.stop(); } catch (_) {} popupSource = null; }
  popupIsPlaying = false;
  $('popup-play-btn').innerHTML = '▶ Play'; $('popup-play-btn').classList.remove('playing');
  if (popupAnimRaf) { cancelAnimationFrame(popupAnimRaf); popupAnimRaf = null; }
  popupOffset = popupLoopOn ? popupLoopStart : 0;
  updatePlayheadUI($, popupOffset); renderMinimap($);
  document.getElementById('popup-playhead').style.display = 'none';
  }

  function seekTo(t, $) {
  const was = popupIsPlaying; if (was) popupPause();
  popupOffset = Math.max(0, Math.min(t, popupBuffer ? popupBuffer.duration : 0));
  updatePlayheadUI($, popupOffset); renderMinimap($);
  if (was) popupPlay($);
  }

  function getLiveTime() {
  if (!popupIsPlaying || !popupCtx || !popupBuffer) return popupOffset;
  const el = popupCtx.currentTime - popupCtxStart;
  if (popupLoopOn) { const ld = popupLoopEnd - popupLoopStart; if (ld > 0) return popupLoopStart + ((el - popupLoopStart) % ld + ld) % ld; }
  return Math.min(el, popupBuffer.duration);
  }

  function updatePlayheadUI($, t) {
  if (!popupBuffer) return;
  const pct = t / popupBuffer.duration;
  document.getElementById('popup-progress-fill').style.width = (pct * 100) + '%';
  document.getElementById('popup-t-current').textContent = fmtTime(t);
  const px = timeToX(t);
  const ph = document.getElementById('popup-playhead');
  ph.style.left = px + 'px';
  ph.style.display = (px >= 0 && px <= cW) ? 'block' : 'none';
  }

  let lastMmTs = 0;
  function animLoop(ts, $) {
  if (!popupIsPlaying) return;
  const t = getLiveTime(); updatePlayheadUI($, t);
  if (ts - lastMmTs > 66) { renderMinimap($); lastMmTs = ts; }
  popupAnimRaf = requestAnimationFrame(ts2 => animLoop(ts2, $));
  }

  // ── Volume helpers ──
  function refreshVolSlider($) {
  const s = $('popup-vol-slider');
  s.style.background = `linear-gradient(90deg,rgba(154,154,165,0.92) ${popupVolume}%,rgba(255,255,255,0.12) ${popupVolume}%)`;
  }
  function updateVolIcon($) {
  const btn = $('popup-mute-btn');
  btn.textContent = popupMuted || popupVolume === 0 ? '🔇' : popupVolume < 40 ? '🔈' : popupVolume < 75 ? '🔉' : '🔊';
  }

  // ── Close popup ──
  function closePopup() {
  if (popupAnimRaf) { cancelAnimationFrame(popupAnimRaf); popupAnimRaf = null; }
  if (popupSource)  { try { popupSource.stop(); } catch (_) {} popupSource = null; }
  if (popupCtx)     { try { popupCtx.close(); }  catch (_) {} popupCtx = null; }
  if (popupResizeObs) { popupResizeObs.disconnect(); popupResizeObs = null; }
  if (popupDocMouseMoveHandler) { document.removeEventListener('mousemove', popupDocMouseMoveHandler); popupDocMouseMoveHandler = null; }
  if (popupDocMouseUpHandler) { document.removeEventListener('mouseup', popupDocMouseUpHandler); popupDocMouseUpHandler = null; }
  if (popupDocKeydownHandler) { document.removeEventListener('keydown', popupDocKeydownHandler, true); popupDocKeydownHandler = null; }
  const overlay = document.getElementById('loop-modal-overlay');
  if (overlay) overlay.remove();
  popupOpen = false; popupIsPlaying = false; popupBuffer = null; popupPeaks = null;
  document.getElementById("loopButton")?.focus();
  }

  // ── Formatters ──
  const fmtTime = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
  const fmtDur  = s => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;


  // Host application bridge: apply/clear the popup selection on the main audio
  // element and update the same state used by playback and video export.
  function updateMainLoopButton() {
  syncLoopButton();
  }

  function applyAudioLoop(start, end) {
  applyAudioLoopToVisualizer(start, end, {
      bpm: popupBpm,
      bars: popupLoopBars,
      snap: true
  });
  }

  function clearAudioLoop() {
  clearAudioLoopFromVisualizer();
  }
  return { open: openLoopPopup, close: closePopup, syncButton: updateMainLoopButton };
})();

// Register late-bound implementations on the core hooks registry.
hooks.getSelectedLoopRange = getSelectedLoopRange;
hooks.hasPartialLoopSelection = hasPartialLoopSelection;
hooks.syncLoopButton = syncLoopButton;
