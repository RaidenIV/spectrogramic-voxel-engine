// playback.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Audio graph, synchronized playback clock, timeline seek.
import { audio, currentTimeLabel, durationLabel, hooks, playButton, runtime, state, status, timeline } from "./core.js";
import { clamp, formatTime } from "./utils.js";
import { appendWaveformRow } from "./analysis.js";
import { clearHistory } from "./renderer.js";

export function getTrackDuration() {
  const decodedDuration = runtime.decodedAudioBuffer?.duration;

  if (Number.isFinite(decodedDuration) && decodedDuration > 0) {
    return decodedDuration;
  }

  return Number.isFinite(audio.duration) && audio.duration > 0
    ? audio.duration
    : 0;
}

export function getPlaybackTimelineRange() {
  const duration = getTrackDuration();

  if (state.audioLoop && hooks.hasPartialLoopSelection()) {
    const range = hooks.getSelectedLoopRange();
    return { ...range, isLoop: true };
  }

  return {
    start: 0,
    end: duration,
    duration,
    isLoop: false
  };
}

export function timelineValueFromAudioTime(time) {
  const range = getPlaybackTimelineRange();
  const safeTime = Number.isFinite(Number(time))
    ? Number(time)
    : range.start;

  return clamp(safeTime - range.start, 0, Math.max(0, range.duration));
}

export function audioTimeFromTimelineValue(value) {
  const range = getPlaybackTimelineRange();
  const relativeTime = clamp(
    Number(value) || 0,
    0,
    Math.max(0, range.duration)
  );

  return clamp(
    range.start + relativeTime,
    range.start,
    Math.max(range.start, range.end)
  );
}

export function syncPlaybackTimeline(time = audio.currentTime, preserveSlider = false) {
  const range = getPlaybackTimelineRange();
  const relativeTime = timelineValueFromAudioTime(time);
  const safeDuration = Math.max(0.001, range.duration || 0);

  timeline.min = "0";
  timeline.max = String(safeDuration);

  if (!preserveSlider) {
    timeline.value = String(relativeTime);
  }

  const displayedTime = preserveSlider
    ? Number(timeline.value)
    : relativeTime;

  currentTimeLabel.textContent = formatTime(displayedTime);
  durationLabel.textContent = formatTime(range.duration);
  timeline.title = range.isLoop
    ? `Loop ${formatTime(range.start)}–${formatTime(range.end)}`
    : "Track timeline";
  timeline.setAttribute(
    "aria-valuetext",
    `${formatTime(displayedTime)} of ${formatTime(range.duration)}${range.isLoop ? " loop" : ""}`
  );
}

export function updateOutputAudioLevel() {
  const outputLevel = state.muted
    ? 0
    : clamp(state.volume, 0, 1);

  // Keep the media element neutral so its volume state cannot alter
  // the analyser input used by the visualization.
  audio.volume = 1;
  audio.muted = false;

  if (runtime.outputGainNode && runtime.audioContext) {
    runtime.outputGainNode.gain.setValueAtTime(
      outputLevel,
      runtime.audioContext.currentTime
    );
  }
}

export async function ensureAudioGraph() {
  if (!runtime.audioContext) {
    runtime.audioContext = new AudioContext();
  }

  if (!runtime.sourceNode) {
    runtime.sourceNode = runtime.audioContext.createMediaElementSource(audio);
    runtime.analyser = runtime.audioContext.createAnalyser();
    runtime.outputGainNode = runtime.audioContext.createGain();

    // Analyse the unattenuated signal, then apply volume/mute only
    // after analysis on the route to the user's speakers.
    runtime.sourceNode.connect(runtime.analyser);
    runtime.analyser.connect(runtime.outputGainNode);
    runtime.outputGainNode.connect(runtime.audioContext.destination);
  }

  updateOutputAudioLevel();
  runtime.analyser.fftSize = state.fftSize;
  runtime.waveformData = new Uint8Array(runtime.analyser.fftSize);
  runtime.frequencyData = new Uint8Array(
    runtime.analyser.frequencyBinCount
  );

  if (runtime.audioContext.state === "suspended") {
    await runtime.audioContext.resume();
  }
}

export async function togglePlayback() {
  if (!runtime.audioReady || playButton.disabled || !audio.src) {
    return;
  }

  try {
    await ensureAudioGraph();

    if (audio.paused) {
      if (state.audioLoop && hooks.hasPartialLoopSelection()) {
        const range = hooks.getSelectedLoopRange();

        if (
          audio.currentTime < range.start ||
          audio.currentTime >= range.end
        ) {
          audio.currentTime = range.start;
          clearHistory();
        }
      }

      runtime.nextCaptureAudioTime = audio.currentTime;
      await audio.play();
    } else {
      audio.pause();
    }
  } catch (error) {
    console.error(error);
    status.textContent = `Audio error: ${error.message}`;
  }
}

export function synchronizeCascadeToAudioTime() {
  if (!runtime.analyser || audio.paused || audio.ended) {
    return;
  }

  const interval = 1 / state.cascadeRate;

  if (
    !Number.isFinite(runtime.nextCaptureAudioTime) ||
    audio.currentTime + interval < runtime.nextCaptureAudioTime
  ) {
    runtime.nextCaptureAudioTime = audio.currentTime;
  }

  let capturedRows = 0;
  const maximumCatchUpRows = 4;

  while (
    audio.currentTime >= runtime.nextCaptureAudioTime &&
    capturedRows < maximumCatchUpRows
  ) {
    appendWaveformRow();
    runtime.nextCaptureAudioTime += interval;
    capturedRows++;
  }

  if (capturedRows === maximumCatchUpRows) {
    runtime.nextCaptureAudioTime = audio.currentTime + interval;
  }
}

export function commitTimelineSeek() {
  audio.currentTime = audioTimeFromTimelineValue(timeline.value);
  runtime.nextCaptureAudioTime = audio.currentTime;
  runtime.isSeeking = false;
  syncPlaybackTimeline(audio.currentTime);
  clearHistory();
  hooks.syncLoopButton();
}
