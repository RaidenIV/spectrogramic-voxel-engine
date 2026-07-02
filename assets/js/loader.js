// loader.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Audio file loading and progress UI.
import { audio, audioFileButton, audioFileButtonText, audioFileInput, audioLoadProgress, audioLoadProgressText, audioLoadProgressWrap, audioLoadStage, exportVideoButton, fftLoadProgress, fftLoadProgressText, fftLoadProgressWrap, fftLoadStage, hooks, playButton, runtime, state, status, timeline } from "./core.js";
import { clamp, formatTime } from "./utils.js";
import { rebuildHudFrequencySpectrogram } from "./analysis.js";
import { clearHistory } from "./renderer.js";
import { syncPlaybackTimeline } from "./playback.js";
import { initializeLoopSelection, syncLoopButton } from "./loop.js";

export function setAudioLoadProgress(percent, stage = "Loading audio…") {
  window.clearTimeout(runtime.audioLoadProgressHideTimer);
  const normalized = clamp(Number(percent) || 0, 0, 100);
  const rounded = Math.round(normalized);

  audioFileInput.disabled = true;
  audioFileButton.classList.add("is-loading");
  audioFileButton.setAttribute("aria-disabled", "true");
  audioFileButton.title = `${stage} ${rounded}%`;
  audioFileButtonText.hidden = true;
  audioLoadProgressWrap.hidden = false;
  audioLoadProgress.value = normalized;
  audioLoadProgressText.textContent = `${rounded}%`;
  audioLoadStage.textContent = stage;
}

export function hideAudioLoadProgress(delay = 0) {
  window.clearTimeout(runtime.audioLoadProgressHideTimer);
  const hide = () => {
    audioLoadProgressWrap.hidden = true;
    audioLoadProgress.value = 0;
    audioLoadProgressText.textContent = "0%";
    audioLoadStage.textContent = "Preparing audio…";
    audioFileButtonText.hidden = false;
    audioFileButton.classList.remove("is-loading");
    audioFileButton.setAttribute("aria-disabled", "false");
    audioFileButton.removeAttribute("title");
    audioFileInput.disabled = false;
  };

  if (delay > 0) {
    runtime.audioLoadProgressHideTimer = window.setTimeout(hide, delay);
  } else {
    hide();
  }
}

export function setFftLoadProgress(
  percent,
  stage = "Applying audio resolution…"
) {
  window.clearTimeout(runtime.fftLoadProgressHideTimer);
  const normalized = clamp(Number(percent) || 0, 0, 100);
  fftLoadProgressWrap.hidden = false;
  fftLoadProgress.value = normalized;
  fftLoadProgressText.textContent = `${Math.round(normalized)}%`;
  fftLoadStage.textContent = stage;
}

export function hideFftLoadProgress(delay = 0) {
  window.clearTimeout(runtime.fftLoadProgressHideTimer);
  const hide = () => {
    fftLoadProgressWrap.hidden = true;
    fftLoadProgress.value = 0;
    fftLoadProgressText.textContent = "0%";
    fftLoadStage.textContent = "Preparing audio resolution…";
  };

  if (delay > 0) {
    runtime.fftLoadProgressHideTimer = window.setTimeout(hide, delay);
  } else {
    hide();
  }
}

export function readAudioFileWithProgress(file, version) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("progress", (event) => {
      if (version !== runtime.audioLoadVersion) {
        reader.abort();
        return;
      }

      const ratio = event.lengthComputable && event.total > 0
        ? event.loaded / event.total
        : 0;

      setAudioLoadProgress(
        5 + ratio * 60,
        `Reading file · ${Math.round(ratio * 100)}%`
      );
    });

    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("Audio file could not be read."));
    });
    reader.addEventListener("abort", () => {
      reject(new DOMException("Audio loading was cancelled.", "AbortError"));
    });
    reader.readAsArrayBuffer(file);
  });
}

export async function loadAudioFile(file) {
  if (!file) {
    return;
  }

  runtime.audioReady = false;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  playButton.disabled = true;
  timeline.disabled = true;
  playButton.textContent = "Play";

  if (runtime.currentObjectUrl) {
    URL.revokeObjectURL(runtime.currentObjectUrl);
  }

  const loadVersion = ++runtime.audioLoadVersion;
  runtime.loopBpmDetectionVersion++;
  runtime.currentObjectUrl = URL.createObjectURL(file);
  runtime.loadedAudioFileName = file.name;
  runtime.decodedAudioBuffer = null;
  runtime.loopWaveformPeaks = null;
  state.frequencySpectrogramData = null;
  state.hudSpectrumBuffer = null;
  state.hudSpectrumSmoothed = null;
  state.hudLiveFrequencyDb = null;
  state.hudWaveformBuffer = null;
  state.hudLevel = null;
  state.hudLayer = null;
  state.loopReady = false;
  state.audioLoop = false;
  audio.loop = false;
  syncLoopButton();
  exportVideoButton.disabled = true;
  status.textContent = `Analyzing ${file.name}…`;
  hooks.setVideoExportStatus("Decoding audio for deterministic export…", "active");
  playButton.disabled = true;
  timeline.disabled = true;
  playButton.textContent = "Play";
  clearHistory();
  hideFftLoadProgress();
  setAudioLoadProgress(2, "Preparing audio reader…");

  try {
    if (!runtime.audioContext) {
      runtime.audioContext = new AudioContext();
    }

    setAudioLoadProgress(5, "Reading audio file…");
    const fileBytes = await readAudioFileWithProgress(file, loadVersion);

    if (loadVersion !== runtime.audioLoadVersion) {
      return;
    }

    setAudioLoadProgress(70, "Decoding audio…");
    const decodedBuffer = await runtime.audioContext.decodeAudioData(
      fileBytes.slice(0)
    );

    if (loadVersion !== runtime.audioLoadVersion) {
      return;
    }

    setAudioLoadProgress(88, "Building waveform and loop data…");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    runtime.decodedAudioBuffer = decodedBuffer;
    initializeLoopSelection(runtime.decodedAudioBuffer);
    state.hudLayer = null;
    setAudioLoadProgress(90, "Analyzing viewport frequency graph…");
    await rebuildHudFrequencySpectrogram({
      shouldCancel: () => loadVersion !== runtime.audioLoadVersion,
      onProgress: (amount) => {
        setAudioLoadProgress(
          90 + amount * 9,
          `Analyzing viewport frequency graph · ${Math.round(amount * 100)}%`
        );
      }
    });

    if (loadVersion !== runtime.audioLoadVersion) {
      return;
    }

    audio.src = runtime.currentObjectUrl;
    audio.load();
    syncPlaybackTimeline(0);
    exportVideoButton.disabled = false;
    status.textContent = file.name;
    hooks.setVideoExportStatus(
      `Ready · ${formatTime(runtime.decodedAudioBuffer.duration)} decoded audio`,
      "idle"
    );
    setAudioLoadProgress(100, "Audio ready");
    runtime.audioReady = true;
    playButton.disabled = false;
    timeline.disabled = false;
    hideAudioLoadProgress(900);
  } catch (error) {
    if (loadVersion !== runtime.audioLoadVersion) {
      return;
    }

    console.error(error);
    runtime.audioReady = false;
    playButton.disabled = true;
    timeline.disabled = true;
    state.loopReady = false;
    state.audioLoop = false;
    runtime.loopWaveformPeaks = null;
    syncLoopButton();
    status.textContent = file.name;
    hooks.setVideoExportStatus(
      `Audio analysis failed: ${error.message}`,
      "error"
    );
    setAudioLoadProgress(0, "Audio loading failed");
    hideAudioLoadProgress(1600);
  }
}
