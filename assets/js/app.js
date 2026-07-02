import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ALLOWED_COLORMAPS,
  AMPLITUDE_COLORMAPS,
  CAMERA_PRESETS,
  COLORMAP_INDEX,
  DARK_MODE_HUD_COLOR,
  DARK_VIEWPORT_BACKGROUND,
  LIGHT_MODE_HUD_COLOR,
  LIGHT_VIEWPORT_BACKGROUND,
  SECTION_DEFAULT_KEYS,
  defaults
} from "./config.js";
import { createLoopModalController } from "./loop.js";
import { clamp, formatTime, sanitizeFileName } from "./utils.js";

    const viewport = document.getElementById("viewport");
    const viewportFrame = document.getElementById("viewportFrame");
    const viewportLogo = document.getElementById("viewportLogo");
    const status = document.getElementById("status");
    const fpsCounter = document.getElementById("fpsCounter");
    const audioFileInput = document.getElementById("audioFile");
    const audioLoadProgressWrap =
      document.getElementById("audioLoadProgressWrap");
    const audioLoadProgress = document.getElementById("audioLoadProgress");
    const audioLoadProgressText =
      document.getElementById("audioLoadProgressText");
    const audioLoadStage = document.getElementById("audioLoadStage");
    const fftLoadProgressWrap =
      document.getElementById("fftLoadProgressWrap");
    const fftLoadProgress = document.getElementById("fftLoadProgress");
    const fftLoadProgressText =
      document.getElementById("fftLoadProgressText");
    const fftLoadStage = document.getElementById("fftLoadStage");
    const playButton = document.getElementById("playButton");
    const clearButton = document.getElementById("clearButton");
    const timeline = document.getElementById("timeline");
    const currentTimeLabel = document.getElementById("currentTime");
    const durationLabel = document.getElementById("duration");
    const loopButton = document.getElementById("loopButton");
    const loopStatus = document.getElementById("loopStatus");
    const cameraPresetInput = document.getElementById("cameraPreset");
    const applyCameraPresetButton = document.getElementById("applyCameraPreset");
    const app = document.getElementById("app");
    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebarToggleIcon = document.getElementById("sidebarToggleIcon");
    const orientationInput = document.getElementById("orientation");
    const aspectRatioInput = document.getElementById("aspectRatio");
    const viewportSizeInput = document.getElementById("viewportSize");
    const viewportResolutionInput =
      document.getElementById("viewportResolution");
    const exportFileNameInput = document.getElementById("exportFileName");
    const videoFileTypeInput = document.getElementById("videoFileType");
    const videoFrameRateInput = document.getElementById("videoFrameRate");
    const videoBitrateInput = document.getElementById("videoBitrate");
    const exportVideoButton = document.getElementById("exportVideoButton");
    const videoExportStatus = document.getElementById("videoExportStatus");
    const videoExportProgress = document.getElementById("videoExportProgress");
    const videoExportOverlay = document.getElementById("videoExportOverlay");
    const videoExportOverlayStatus =
      document.getElementById("videoExportOverlayStatus");
    const videoExportOverlayProgress =
      document.getElementById("videoExportOverlayProgress");
    const videoExportCancel = document.getElementById("videoExportCancel");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#000000");

    const camera = new THREE.PerspectiveCamera(
      50,
      16 / 9,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });

    renderer.setPixelRatio(1);
    renderer.setSize(1920, 1080, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    viewportFrame.appendChild(renderer.domElement);

    const hudCanvas = document.createElement("canvas");
    const hudContext = hudCanvas.getContext("2d", { alpha: true });
    let hudTexture = new THREE.CanvasTexture(hudCanvas);
    hudTexture.colorSpace = THREE.SRGBColorSpace;
    hudTexture.minFilter = THREE.LinearFilter;
    hudTexture.magFilter = THREE.LinearFilter;
    hudTexture.generateMipmaps = false;

    const hudScene = new THREE.Scene();
    const hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    hudCamera.position.z = 1;
    const hudMaterial = new THREE.MeshBasicMaterial({
      map: hudTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const hudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hudMaterial);
    hudQuad.frustumCulled = false;
    hudScene.add(hudQuad);

    function rebuildHudCanvasTexture() {
      const previousTexture = hudTexture;
      hudTexture = new THREE.CanvasTexture(hudCanvas);
      hudTexture.colorSpace = THREE.SRGBColorSpace;
      hudTexture.minFilter = THREE.LinearFilter;
      hudTexture.magFilter = THREE.LinearFilter;
      hudTexture.generateMipmaps = false;
      hudMaterial.map = hudTexture;
      hudMaterial.needsUpdate = true;
      previousTexture.dispose();
    }

    const hudDrawingBufferSize = new THREE.Vector2();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.screenSpacePanning = true;
    controls.minDistance = 3;
    controls.maxDistance = 520;
    controls.target.set(0, 0, -30);
    controls.addEventListener("start", () => {
      markCameraPresetCustom();
    });

    const ambientLight = new THREE.HemisphereLight(
      0xdde8ff,
      0x211b18,
      1.2
    );
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e8, 4);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 600;
    keyLight.shadow.camera.left = -160;
    keyLight.shadow.camera.right = 160;
    keyLight.shadow.camera.top = 120;
    keyLight.shadow.camera.bottom = -120;
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.normalBias = 0.035;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight(0xb8d4ff, 1.5);
    fillLight.position.set(-45, 28, 25);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
    rimLight.position.set(0, 20, -100);
    scene.add(rimLight);



    const state = { ...defaults };




    Object.assign(state, {
      audioLoop: false,
      loopStart: 0,
      loopEnd: 0,
      loopBpm: 125,
      loopBars: 4,
      loopSnap: true,
      loopReady: false,
      frequencySpectrogramData: null,
      hudSpectrumBuffer: null,
      hudSpectrumSmoothed: null,
      hudWaveformBuffer: null,
      hudLevel: null,
      hudLayer: null,
      exportLogoImage: null,
      exportLogoImageKey: "",
      exportPlaybackTimeOverride: null,
      exportFrameRateOverride: null
    });

    const waveformGroup = new THREE.Group();
    scene.add(waveformGroup);

    let waveformGeometry = null;
    let upperRowMeshes = [];
    let undersideRowMeshes = [];
    let historyData = new Float32Array(state.count * state.historyRows);
    let historyHead = 0;
    let historyCount = 0;
    let forceBlankHistoryGrid = false;
    let smoothedSamples = new Float32Array(state.count);
    let matrixDirty = true;

    const dummy = new THREE.Object3D();
    const temporaryUpperColor = new THREE.Color();
    const temporaryUndersideColor = new THREE.Color();
    const temporaryPeakColor = new THREE.Color();
    const temporaryBackgroundColor = new THREE.Color();

    const temporaryColormapColor = new THREE.Color();
    const colormapColorA = new THREE.Color();
    const colormapColorB = new THREE.Color();



    function sampleAmplitudeColormap(name, amount, target) {
      const stops = AMPLITUDE_COLORMAPS[name];

      if (!stops) {
        return target.set(state.peakColor);
      }

      const t = clamp(amount, 0, 1);

      for (let index = 0; index < stops.length - 1; index++) {
        const current = stops[index];
        const next = stops[index + 1];

        if (t <= next[0]) {
          const range = Math.max(0.000001, next[0] - current[0]);
          const localT = (t - current[0]) / range;

          colormapColorA.set(current[1]);
          colormapColorB.set(next[1]);

          return target.copy(colormapColorA).lerp(
            colormapColorB,
            clamp(localT, 0, 1)
          );
        }
      }

      return target.set(stops[stops.length - 1][1]);
    }

    const audio = new Audio();
    audio.preload = "metadata";

    let audioContext = null;
    let analyser = null;
    let sourceNode = null;
    let outputGainNode = null;
    let waveformData = null;
    let frequencyData = null;
    let currentObjectUrl = null;
    let decodedAudioBuffer = null;
    let loadedAudioFileName = "";
    let nextCaptureAudioTime = 0;
    let isSeeking = false;
    let loopWrapPending = false;
    let loopWaveformPeaks = null;
    let loopBpmDetectionVersion = 0;
    let audioLoadVersion = 0;
    let audioReady = false;
    let audioLoadProgressHideTimer = 0;
    let fftLoadProgressHideTimer = 0;
    let fftProgressVersion = 0;

    function setAudioLoadProgress(percent, stage = "Loading audio…") {
      window.clearTimeout(audioLoadProgressHideTimer);
      const normalized = clamp(Number(percent) || 0, 0, 100);
      audioLoadProgressWrap.hidden = false;
      audioLoadProgress.value = normalized;
      audioLoadProgressText.textContent = `${Math.round(normalized)}%`;
      audioLoadStage.textContent = stage;
    }

    function hideAudioLoadProgress(delay = 0) {
      window.clearTimeout(audioLoadProgressHideTimer);
      const hide = () => {
        audioLoadProgressWrap.hidden = true;
        audioLoadProgress.value = 0;
        audioLoadProgressText.textContent = "0%";
        audioLoadStage.textContent = "Preparing audio…";
      };

      if (delay > 0) {
        audioLoadProgressHideTimer = window.setTimeout(hide, delay);
      } else {
        hide();
      }
    }

    function setFftLoadProgress(
      percent,
      stage = "Applying audio resolution…"
    ) {
      window.clearTimeout(fftLoadProgressHideTimer);
      const normalized = clamp(Number(percent) || 0, 0, 100);
      fftLoadProgressWrap.hidden = false;
      fftLoadProgress.value = normalized;
      fftLoadProgressText.textContent = `${Math.round(normalized)}%`;
      fftLoadStage.textContent = stage;
    }

    function hideFftLoadProgress(delay = 0) {
      window.clearTimeout(fftLoadProgressHideTimer);
      const hide = () => {
        fftLoadProgressWrap.hidden = true;
        fftLoadProgress.value = 0;
        fftLoadProgressText.textContent = "0%";
        fftLoadStage.textContent = "Preparing audio resolution…";
      };

      if (delay > 0) {
        fftLoadProgressHideTimer = window.setTimeout(hide, delay);
      } else {
        hide();
      }
    }

    function readAudioFileWithProgress(file, version) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener("progress", (event) => {
          if (version !== audioLoadVersion) {
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

    let isExportingPng = false;
    let isExportingVideo = false;
    let videoExportCancelled = false;
    const videoExportCancelHandlers = new Set();
    let Mp4MuxerModule = null;
    let MediabunnyModule = null;

    let fpsFrames = 0;
    let fpsLastUpdate = performance.now();
    let displayedFps = 0;


    const LOCAL_PRESET_KEY = "mirrored-waveform-cascade-presets-v1";





    function getTrackDuration() {
      const decodedDuration = decodedAudioBuffer?.duration;

      if (Number.isFinite(decodedDuration) && decodedDuration > 0) {
        return decodedDuration;
      }

      return Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : 0;
    }

    function getLoopBeatDuration(bpm = state.loopBpm) {
      return bpm > 0 ? 60 / bpm : 0;
    }

    function getLoopBarDuration(bpm = state.loopBpm) {
      return getLoopBeatDuration(bpm) * 4;
    }

    function getSelectedLoopRange() {
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

    function hasPartialLoopSelection() {
      const trackDuration = getTrackDuration();
      const range = getSelectedLoopRange();

      return Boolean(
        state.loopReady &&
        range.duration > 0.01 &&
        range.duration < trackDuration - 0.01
      );
    }

    function getPlaybackTimelineRange() {
      const duration = getTrackDuration();

      if (state.audioLoop && hasPartialLoopSelection()) {
        const range = getSelectedLoopRange();
        return { ...range, isLoop: true };
      }

      return {
        start: 0,
        end: duration,
        duration,
        isLoop: false
      };
    }

    function timelineValueFromAudioTime(time) {
      const range = getPlaybackTimelineRange();
      const safeTime = Number.isFinite(Number(time))
        ? Number(time)
        : range.start;

      return clamp(safeTime - range.start, 0, Math.max(0, range.duration));
    }

    function audioTimeFromTimelineValue(value) {
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

    function syncPlaybackTimeline(time = audio.currentTime, preserveSlider = false) {
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

    function updateAudioLoopMode() {
      audio.loop = Boolean(state.audioLoop && !hasPartialLoopSelection());
    }

    function setLoopStatus(message, tone = "idle") {
      loopStatus.textContent = message;
      loopStatus.dataset.tone = tone;
    }

    function syncLoopButton() {
      const duration = getTrackDuration();
      const range = getSelectedLoopRange();
      const enabled = Boolean(state.loopReady && decodedAudioBuffer && duration > 0);
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

    function buildLoopWaveformPeaks(buffer) {
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

    function initializeLoopSelection(buffer) {
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
      loopWaveformPeaks = buildLoopWaveformPeaks(buffer);
      updateAudioLoopMode();
      syncLoopButton();
    }

    function applyAudioLoopToVisualizer(start, end, options = {}) {
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
        nextCaptureAudioTime = nextStart;
        clearHistory();
      }

      syncPlaybackTimeline(audio.currentTime || nextStart);
      syncLoopButton();
    }

    function clearAudioLoopFromVisualizer() {
      const duration = getTrackDuration();

      state.audioLoop = false;
      state.loopStart = 0;
      state.loopEnd = duration;
      audio.loop = false;
      syncPlaybackTimeline(audio.currentTime);
      syncLoopButton();
    }

    function enforceSelectedLoop() {
      if (
        !state.audioLoop ||
        !hasPartialLoopSelection() ||
        audio.paused ||
        audio.ended ||
        loopWrapPending
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

        loopWrapPending = true;
        audio.currentTime = wrappedTime;
        window.setTimeout(() => {
          loopWrapPending = false;
        }, 160);
        nextCaptureAudioTime = wrappedTime;
        syncPlaybackTimeline(wrappedTime);
        clearHistory();
      }
    }

    async function detectLoopBpm(buffer) {
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


    const loopModalController = createLoopModalController({
      state,
      audio,
      getDecodedAudioBuffer: () => decodedAudioBuffer,
      clamp,
      syncLoopButton,
      applyAudioLoopToVisualizer,
      clearAudioLoopFromVisualizer
    });

    function getVideoExportRange() {
      const fullDuration = decodedAudioBuffer?.duration || 0;

      if (state.audioLoop && hasPartialLoopSelection()) {
        return getSelectedLoopRange();
      }

      return {
        start: 0,
        end: fullDuration,
        duration: fullDuration
      };
    }



    function createGradientUniforms(baseColor) {
      return {
        uEnvelopeBaseColor: {
          value: new THREE.Color(baseColor)
        },
        uEnvelopePeakColor: {
          value: new THREE.Color(state.peakColor)
        },
        uEnvelopeBackgroundColor: {
          value: new THREE.Color(state.backgroundColor)
        },
        uEnvelopeMaximumHeight: {
          value: Math.max(0.0001, state.maxHeight)
        },
        uEnvelopeFadeBrightness: {
          value: 1
        },
        uEnvelopeAmplitudeColor: {
          value: state.amplitudeColor ? 1 : 0
        },
        uEnvelopeColormap: {
          value: COLORMAP_INDEX[state.amplitudeColormap] ?? 0
        },
        uEnvelopeColormapSensitivity: {
          value: state.colormapSensitivity
        },
        uEnvelopeReverseColormap: {
          value: state.reverseColormap ? 1 : 0
        }
      };
    }

    function installVerticalColormapShader(material, baseColor) {
      const uniforms = createGradientUniforms(baseColor);
      material.userData.verticalColormapUniforms = uniforms;

      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);

        shader.vertexShader = `
          varying float vEnvelopeWorldHeight;
        ` + shader.vertexShader;

        shader.vertexShader = shader.vertexShader.replace(
          "#include <project_vertex>",
          `
            #include <project_vertex>

            vec4 envelopeInstancePosition = vec4(position, 1.0);

            #ifdef USE_INSTANCING
              envelopeInstancePosition =
                instanceMatrix * envelopeInstancePosition;
            #endif

            vEnvelopeWorldHeight = abs(
              (modelMatrix * envelopeInstancePosition).y
            );
          `
        );

        shader.fragmentShader = `
          varying float vEnvelopeWorldHeight;

          uniform vec3 uEnvelopeBaseColor;
          uniform vec3 uEnvelopePeakColor;
          uniform vec3 uEnvelopeBackgroundColor;
          uniform float uEnvelopeMaximumHeight;
          uniform float uEnvelopeFadeBrightness;
          uniform float uEnvelopeAmplitudeColor;
          uniform int uEnvelopeColormap;
          uniform float uEnvelopeColormapSensitivity;
          uniform float uEnvelopeReverseColormap;

          vec3 envelopeMapFive(
            float t,
            vec3 c0,
            vec3 c1,
            vec3 c2,
            vec3 c3,
            vec3 c4
          ) {
            if (t <= 0.25) {
              return mix(c0, c1, t / 0.25);
            }

            if (t <= 0.50) {
              return mix(c1, c2, (t - 0.25) / 0.25);
            }

            if (t <= 0.75) {
              return mix(c2, c3, (t - 0.50) / 0.25);
            }

            return mix(c3, c4, (t - 0.75) / 0.25);
          }

          vec3 envelopeMapSix(
            float t,
            vec3 c0,
            vec3 c1,
            vec3 c2,
            vec3 c3,
            vec3 c4,
            vec3 c5
          ) {
            if (t <= 0.20) {
              return mix(c0, c1, t / 0.20);
            }

            if (t <= 0.40) {
              return mix(c1, c2, (t - 0.20) / 0.20);
            }

            if (t <= 0.60) {
              return mix(c2, c3, (t - 0.40) / 0.20);
            }

            if (t <= 0.80) {
              return mix(c3, c4, (t - 0.60) / 0.20);
            }

            return mix(c4, c5, (t - 0.80) / 0.20);
          }

          vec3 envelopeSampleColormap(float t) {
            t = clamp(
              t * max(uEnvelopeColormapSensitivity, 0.0001),
              0.0,
              1.0
            );

            if (uEnvelopeReverseColormap > 0.5) {
              t = 1.0 - t;
            }

            if (uEnvelopeAmplitudeColor < 0.5) {
              return uEnvelopeBaseColor;
            }

            if (uEnvelopeColormap == 0) {
              return mix(
                uEnvelopeBaseColor,
                uEnvelopePeakColor,
                t
              );
            }

            if (uEnvelopeColormap == 1) {
              return envelopeMapFive(
                t,
                vec3(0.2667, 0.0039, 0.3294),
                vec3(0.2314, 0.3216, 0.5451),
                vec3(0.1294, 0.5686, 0.5490),
                vec3(0.3686, 0.7882, 0.3843),
                vec3(0.9922, 0.9059, 0.1451)
              );
            }

            if (uEnvelopeColormap == 2) {
              return envelopeMapFive(
                t,
                vec3(0.0510, 0.0314, 0.5294),
                vec3(0.4941, 0.0118, 0.6588),
                vec3(0.8000, 0.2784, 0.4706),
                vec3(0.9725, 0.5843, 0.2510),
                vec3(0.9412, 0.9765, 0.1294)
              );
            }

            if (uEnvelopeColormap == 3) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0000, 0.0157),
                vec3(0.2588, 0.0392, 0.4078),
                vec3(0.5765, 0.1490, 0.4039),
                vec3(0.8667, 0.3176, 0.2275),
                vec3(0.9882, 1.0000, 0.6431)
              );
            }

            if (uEnvelopeColormap == 4) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0000, 0.0157),
                vec3(0.2314, 0.0588, 0.4392),
                vec3(0.5490, 0.1608, 0.5059),
                vec3(0.8706, 0.2863, 0.4078),
                vec3(0.9882, 0.9922, 0.7490)
              );
            }

            if (uEnvelopeColormap == 5) {
              return envelopeMapSix(
                t,
                vec3(0.1882, 0.0706, 0.2314),
                vec3(0.2745, 0.4196, 0.8902),
                vec3(0.1059, 0.8118, 0.8314),
                vec3(0.3804, 0.9882, 0.4235),
                vec3(0.9765, 0.7294, 0.2196),
                vec3(0.4784, 0.0157, 0.0118)
              );
            }

            if (uEnvelopeColormap == 6) {
              return envelopeMapFive(
                t,
                vec3(0.2314, 0.2980, 0.7529),
                vec3(0.5529, 0.6902, 0.9961),
                vec3(0.8667, 0.8667, 0.8667),
                vec3(0.9569, 0.5961, 0.4784),
                vec3(0.7059, 0.0157, 0.1490)
              );
            }

            if (uEnvelopeColormap == 7) {
              return mix(
                vec3(0.0627),
                vec3(1.0),
                t
              );
            }

            if (uEnvelopeColormap == 8) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.1333, 0.3059),
                vec3(0.2627, 0.3059, 0.4235),
                vec3(0.4902, 0.4863, 0.4706),
                vec3(0.7373, 0.6824, 0.4235),
                vec3(0.9961, 0.9098, 0.2196)
              );
            }

            if (uEnvelopeColormap == 9) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0000, 0.0000),
                vec3(0.0863, 0.2392, 0.3059),
                vec3(0.6275, 0.4745, 0.2863),
                vec3(0.7804, 0.7020, 0.9294),
                vec3(1.0000, 1.0000, 1.0000)
              );
            }

            if (uEnvelopeColormap == 10) {
              return envelopeMapFive(
                t,
                vec3(0.6196, 0.0039, 0.2588),
                vec3(0.9569, 0.4275, 0.2627),
                vec3(1.0000, 1.0000, 0.7490),
                vec3(0.4000, 0.7608, 0.6471),
                vec3(0.3686, 0.3098, 0.6353)
              );
            }

            if (uEnvelopeColormap == 11) {
              return envelopeMapSix(
                t,
                vec3(0.4314, 0.2510, 0.6667),
                vec3(0.1843, 0.4902, 0.8824),
                vec3(0.1255, 0.7882, 0.5922),
                vec3(0.6588, 0.8824, 0.0471),
                vec3(1.0000, 0.6235, 0.1098),
                vec3(0.8431, 0.0980, 0.1098)
              );
            }

            if (uEnvelopeColormap == 12) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0706, 0.0980),
                vec3(0.0000, 0.3725, 0.4510),
                vec3(0.0392, 0.5765, 0.5882),
                vec3(0.5804, 0.8235, 0.7412),
                vec3(0.9137, 0.8471, 0.6510)
              );
            }

            if (uEnvelopeColormap == 13) {
              return envelopeMapFive(
                t,
                vec3(0.0353, 0.0000, 0.0000),
                vec3(0.4196, 0.0000, 0.0000),
                vec3(0.8431, 0.1882, 0.0000),
                vec3(1.0000, 0.6157, 0.0000),
                vec3(1.0000, 0.9686, 0.6980)
              );
            }

            if (uEnvelopeColormap == 14) {
              return envelopeMapFive(
                t,
                vec3(0.0078, 0.0000, 0.1412),
                vec3(0.0000, 0.2471, 0.5333),
                vec3(0.0000, 0.7059, 0.8471),
                vec3(0.5647, 0.8784, 0.9373),
                vec3(1.0000, 1.0000, 1.0000)
              );
            }

            if (uEnvelopeColormap == 15) {
              return envelopeMapFive(
                t,
                vec3(0.1686, 0.0627, 0.3333),
                vec3(0.4157, 0.0196, 0.4471),
                vec3(0.7882, 0.0941, 0.2902),
                vec3(1.0000, 0.4824, 0.0000),
                vec3(1.0000, 0.8196, 0.4000)
              );
            }

            if (uEnvelopeColormap == 16) {
              return envelopeMapFive(
                t,
                vec3(0.0275, 0.1020, 0.0471),
                vec3(0.0706, 0.3059, 0.1647),
                vec3(0.1765, 0.4902, 0.2745),
                vec3(0.4549, 0.7647, 0.3961),
                vec3(0.9098, 0.9608, 0.7098)
              );
            }

            if (uEnvelopeColormap == 17) {
              return envelopeMapFive(
                t,
                vec3(0.0706, 0.0000, 0.1843),
                vec3(0.4353, 0.0000, 1.0000),
                vec3(1.0000, 0.0000, 0.7843),
                vec3(0.0000, 0.9608, 1.0000),
                vec3(0.8431, 1.0000, 0.0000)
              );
            }

            if (uEnvelopeColormap == 18) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0000, 0.0000),
                vec3(0.1412, 0.2039, 0.2784),
                vec3(0.4353, 0.4980, 0.5020),
                vec3(0.7255, 0.7804, 0.7608),
                vec3(1.0000, 1.0000, 1.0000)
              );
            }

            if (uEnvelopeColormap == 19) {
              return envelopeMapSix(
                t,
                vec3(0.0000, 0.0000, 0.0000),
                vec3(0.0000, 0.0000, 0.8000),
                vec3(0.6000, 0.0000, 0.8000),
                vec3(0.9020, 0.0000, 0.3333),
                vec3(1.0000, 0.6000, 0.0000),
                vec3(1.0000, 1.0000, 0.9020)
              );
            }

            if (uEnvelopeColormap == 20) {
              return envelopeMapSix(
                t,
                vec3(0.1843, 0.0784, 0.2196),
                vec3(0.2392, 0.2980, 0.6039),
                vec3(0.6078, 0.7176, 0.7882),
                vec3(0.8863, 0.8510, 0.8353),
                vec3(0.7843, 0.6039, 0.6157),
                vec3(0.4824, 0.2000, 0.3725)
              );
            }

            if (uEnvelopeColormap == 21) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0000, 0.0000),
                vec3(0.3961, 0.0000, 0.0000),
                vec3(0.8314, 0.0000, 0.0000),
                vec3(1.0000, 0.6902, 0.0000),
                vec3(1.0000, 1.0000, 1.0000)
              );
            }

            if (uEnvelopeColormap == 22) {
              return mix(
                vec3(0.0000, 1.0000, 1.0000),
                vec3(1.0000, 0.0000, 1.0000),
                t
              );
            }

            if (uEnvelopeColormap == 23) {
              if (t <= 0.33) {
                return mix(
                  vec3(0.0431, 0.0000, 0.0000),
                  vec3(1.0000, 0.0000, 0.0000),
                  t / 0.33
                );
              }

              if (t <= 0.66) {
                return mix(
                  vec3(1.0000, 0.0000, 0.0000),
                  vec3(1.0000, 1.0000, 0.0000),
                  (t - 0.33) / 0.33
                );
              }

              return mix(
                vec3(1.0000, 1.0000, 0.0000),
                vec3(1.0000, 1.0000, 1.0000),
                (t - 0.66) / 0.34
              );
            }

            if (uEnvelopeColormap == 24) {
              if (t <= 0.17) {
                return mix(
                  vec3(0.0000, 0.0000, 0.5020),
                  vec3(0.0000, 0.0000, 1.0000),
                  t / 0.17
                );
              }

              if (t <= 0.35) {
                return mix(
                  vec3(0.0000, 0.0000, 1.0000),
                  vec3(0.0000, 1.0000, 1.0000),
                  (t - 0.17) / 0.18
                );
              }

              if (t <= 0.50) {
                return mix(
                  vec3(0.0000, 1.0000, 1.0000),
                  vec3(0.4980, 1.0000, 0.4980),
                  (t - 0.35) / 0.15
                );
              }

              if (t <= 0.65) {
                return mix(
                  vec3(0.4980, 1.0000, 0.4980),
                  vec3(1.0000, 1.0000, 0.0000),
                  (t - 0.50) / 0.15
                );
              }

              if (t <= 0.83) {
                return mix(
                  vec3(1.0000, 1.0000, 0.0000),
                  vec3(1.0000, 0.0000, 0.0000),
                  (t - 0.65) / 0.18
                );
              }

              return mix(
                vec3(1.0000, 0.0000, 0.0000),
                vec3(0.5020, 0.0000, 0.0000),
                (t - 0.83) / 0.17
              );
            }

            if (uEnvelopeColormap == 25) {
              return envelopeMapSix(
                t,
                vec3(0.2000, 0.2000, 0.6000),
                vec3(0.0000, 0.4510, 0.9020),
                vec3(0.1608, 0.6392, 0.1608),
                vec3(0.7216, 0.7020, 0.3529),
                vec3(0.5490, 0.3843, 0.2235),
                vec3(1.0000, 1.0000, 1.0000)
              );
            }

            if (uEnvelopeColormap == 26) {
              return envelopeMapFive(
                t,
                vec3(0.0000, 0.0000, 0.0000),
                vec3(0.3020, 0.1882, 0.1490),
                vec3(0.6039, 0.3765, 0.2980),
                vec3(0.9059, 0.5647, 0.4471),
                vec3(1.0000, 0.7804, 0.4980)
              );
            }

            if (uEnvelopeColormap == 27) {
              return mix(
                vec3(1.0000, 0.0000, 1.0000),
                vec3(1.0000, 1.0000, 0.0000),
                t
              );
            }

            if (uEnvelopeColormap == 28) {
              return mix(
                vec3(1.0000, 0.0000, 0.0000),
                vec3(1.0000, 1.0000, 0.0000),
                t
              );
            }

            if (uEnvelopeColormap == 29) {
              return mix(
                vec3(0.0000, 0.0000, 1.0000),
                vec3(0.0000, 1.0000, 0.5020),
                t
              );
            }

            return uEnvelopeBaseColor;
          }
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
          "vec4 diffuseColor = vec4( diffuse, opacity );",
          `
            float envelopeVerticalAmount = clamp(
              vEnvelopeWorldHeight /
                max(uEnvelopeMaximumHeight, 0.0001),
              0.0,
              1.0
            );

            vec3 envelopeColor = envelopeSampleColormap(
              envelopeVerticalAmount
            );

            envelopeColor = mix(
              uEnvelopeBackgroundColor,
              envelopeColor,
              uEnvelopeFadeBrightness
            );

            vec4 diffuseColor = vec4(
              envelopeColor,
              opacity
            );
          `
        );

        material.userData.compiledShader = shader;
      };

      material.customProgramCacheKey = () => [
        "vertical-envelope-colormap-v3",
        state.materialType
      ].join(":");

      return material;
    }

    function createCubeMaterial(baseColor) {
      const common = {
        color: 0xffffff,
        side: THREE.FrontSide
      };

      let material;

      switch (state.materialType) {
        case "physical":
          material = new THREE.MeshPhysicalMaterial({
            ...common,
            roughness: state.roughness,
            metalness: state.metalness,
            clearcoat: state.clearcoat,
            clearcoatRoughness: state.clearcoatRoughness
          });
          break;

        case "phong":
          material = new THREE.MeshPhongMaterial({
            ...common,
            shininess: state.shininess,
            specular: 0xffffff
          });
          break;

        case "lambert":
          material = new THREE.MeshLambertMaterial(common);
          break;

        case "toon":
          material = new THREE.MeshToonMaterial(common);
          break;

        case "basic":
          material = new THREE.MeshBasicMaterial({
            ...common,
            toneMapped: false,
            fog: true
          });
          break;

        case "standard":
        default:
          material = new THREE.MeshStandardMaterial({
            ...common,
            roughness: state.roughness,
            metalness: state.metalness
          });
          break;
      }

      return installVerticalColormapShader(
        material,
        baseColor
      );
    }

    function disposeWaveformMeshes() {
      for (const mesh of [...upperRowMeshes, ...undersideRowMeshes]) {
        waveformGroup.remove(mesh);
        mesh.material.dispose();
      }

      upperRowMeshes = [];
      undersideRowMeshes = [];

      if (waveformGeometry) {
        waveformGeometry.dispose();
        waveformGeometry = null;
      }
    }

    function resetHistoryStorage() {
      historyData = new Float32Array(state.count * state.historyRows);
      smoothedSamples = new Float32Array(state.count);
      historyHead = 0;
      historyCount = 0;
      matrixDirty = true;
    }

    function configureRowMesh(mesh) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = state.shadows;
      mesh.receiveShadow = state.shadows;
      mesh.frustumCulled = false;
      waveformGroup.add(mesh);
    }

    function rebuildWaveform() {
      disposeWaveformMeshes();

      waveformGeometry = new THREE.BoxGeometry(1, 1, 1);

      for (let age = 0; age < state.historyRows; age++) {
        const upperMesh = new THREE.InstancedMesh(
          waveformGeometry,
          createCubeMaterial(state.cubeColor),
          state.count
        );

        const undersideMesh = new THREE.InstancedMesh(
          waveformGeometry,
          createCubeMaterial(state.undersideColor),
          state.count
        );

        configureRowMesh(upperMesh);
        configureRowMesh(undersideMesh);

        upperRowMeshes.push(upperMesh);
        undersideRowMeshes.push(undersideMesh);
      }

      resetHistoryStorage();
      updateMatrices();
    }

    function updateMaterialProperties() {
      const meshes = [...upperRowMeshes, ...undersideRowMeshes];

      for (const mesh of meshes) {
        const material = mesh.material;

        if ("roughness" in material) {
          material.roughness = state.roughness;
        }

        if ("metalness" in material) {
          material.metalness = state.metalness;
        }

        if ("clearcoat" in material) {
          material.clearcoat = state.clearcoat;
        }

        if ("clearcoatRoughness" in material) {
          material.clearcoatRoughness = state.clearcoatRoughness;
        }

        if ("shininess" in material) {
          material.shininess = state.shininess;
        }

        material.needsUpdate = true;
      }

      matrixDirty = true;
    }

    function clearHistory(showBlankGrid = false) {
      forceBlankHistoryGrid = Boolean(showBlankGrid);
      resetHistoryStorage();
      updateMatrices();
    }

    function applySpatialSmoothing(
      raw,
      requestedRadius = state.spatialSmoothing
    ) {
      const count = raw.length;
      const radius = Math.round(requestedRadius);

      if (radius <= 0) {
        return raw;
      }

      const spatiallySmoothed = new Float32Array(count);

      for (let index = 0; index < count; index++) {
        const start = Math.max(0, index - radius);
        const end = Math.min(count - 1, index + radius);

        let sum = 0;
        let weightSum = 0;

        for (
          let sampleIndex = start;
          sampleIndex <= end;
          sampleIndex++
        ) {
          const distance = Math.abs(sampleIndex - index);
          const weight = radius + 1 - distance;

          sum += raw[sampleIndex] * weight;
          weightSum += weight;
        }

        spatiallySmoothed[index] = weightSum > 0
          ? sum / weightSum
          : raw[index];
      }

      return spatiallySmoothed;
    }

    function sampleTimeDomain(count) {
      const raw = new Float32Array(count);

      if (!waveformData || waveformData.length === 0) {
        return raw;
      }

      for (let index = 0; index < count; index++) {
        const normalized = count <= 1 ? 0 : index / (count - 1);
        const sourcePosition =
          normalized * (waveformData.length - 1);
        const left = Math.floor(sourcePosition);
        const right = Math.min(
          waveformData.length - 1,
          left + 1
        );
        const interpolation = sourcePosition - left;

        const leftValue = (waveformData[left] - 128) / 128;
        const rightValue = (waveformData[right] - 128) / 128;

        raw[index] = THREE.MathUtils.lerp(
          leftValue,
          rightValue,
          interpolation
        ) * state.sensitivity;
      }

      return applySpatialSmoothing(raw);
    }

    function sampleFrequencyDomain(count) {
      const raw = new Float32Array(count);

      if (
        !frequencyData ||
        frequencyData.length === 0 ||
        !audioContext
      ) {
        return raw;
      }

      const nyquist = audioContext.sampleRate / 2;
      const minimumFrequency = 20;
      const maximumFrequency = Math.max(
        minimumFrequency * 1.01,
        nyquist
      );
      const frequencyRatio =
        maximumFrequency / minimumFrequency;

      for (let index = 0; index < count; index++) {
        const lowerPosition = index / count;
        const upperPosition = (index + 1) / count;

        const lowerFrequency =
          minimumFrequency *
          Math.pow(frequencyRatio, lowerPosition);
        const upperFrequency =
          minimumFrequency *
          Math.pow(frequencyRatio, upperPosition);

        const startBin = clamp(
          Math.floor(
            (lowerFrequency / nyquist) *
            frequencyData.length
          ),
          0,
          frequencyData.length - 1
        );

        const endBin = clamp(
          Math.max(
            startBin + 1,
            Math.ceil(
              (upperFrequency / nyquist) *
              frequencyData.length
            )
          ),
          1,
          frequencyData.length
        );

        let sum = 0;
        let peak = 0;

        for (let bin = startBin; bin < endBin; bin++) {
          const magnitude = frequencyData[bin];
          sum += magnitude;
          peak = Math.max(peak, magnitude);
        }

        const binCount = Math.max(1, endBin - startBin);
        const average = sum / binCount;

        // Peak-dominant sampling preserves narrow frequency events while
        // retaining a small amount of band energy for visual stability.
        const bandMagnitude =
          peak * 0.82 + average * 0.18;

        raw[index] =
          (bandMagnitude / 255) * state.sensitivity;
      }

      // Frequency mode deliberately uses only a fraction of the waveform
      // smoothing radius so adjacent FFT columns remain visually distinct.
      return applySpatialSmoothing(
        raw,
        state.spatialSmoothing * 0.2
      );
    }

    function commitSampledRow(sampled) {
      forceBlankHistoryGrid = false;

      const previousRowIndex = historyCount > 0
        ? historyHead
        : -1;

      for (let index = 0; index < state.count; index++) {
        const minimumTarget =
          state.analysisMode === "frequency" ? 0 : -1;
        const target = clamp(
          sampled[index],
          minimumTarget,
          1
        );
        const previous = smoothedSamples[index];

        let coefficient = Math.abs(target) > Math.abs(previous)
          ? state.attack
          : state.release;

        if (state.analysisMode === "frequency") {
          coefficient = Math.max(coefficient, 0.55);
        }

        smoothedSamples[index] = previous +
          (target - previous) * coefficient;
      }

      historyHead = (historyHead - 1 + state.historyRows) %
        state.historyRows;

      const destinationOffset = historyHead * state.count;

      for (let index = 0; index < state.count; index++) {
        let value = smoothedSamples[index];

        if (
          state.analysisMode !== "frequency" &&
          previousRowIndex >= 0 &&
          state.historyBlend > 0
        ) {
          const previousValue =
            historyData[previousRowIndex * state.count + index];

          value = THREE.MathUtils.lerp(
            value,
            previousValue,
            state.historyBlend
          );
        }

        historyData[destinationOffset + index] = value;
      }

      historyCount = Math.min(state.historyRows, historyCount + 1);
      matrixDirty = true;
    }

    function appendWaveformRow() {
      if (!analyser || audio.paused || audio.ended) {
        return;
      }

      let sampled;

      if (state.analysisMode === "frequency") {
        analyser.smoothingTimeConstant = 0;
        analyser.getByteFrequencyData(frequencyData);
        sampled = sampleFrequencyDomain(state.count);
      } else {
        analyser.smoothingTimeConstant = 0.8;
        analyser.getByteTimeDomainData(waveformData);
        sampled = sampleTimeDomain(state.count);
      }

      commitSampledRow(sampled);
    }

    function readDecodedSample(buffer, channelIndex, samplePosition) {
      const channel = buffer.getChannelData(
        Math.min(channelIndex, buffer.numberOfChannels - 1)
      );

      if (
        samplePosition < 0 ||
        samplePosition >= channel.length
      ) {
        return 0;
      }

      const lowerIndex = clamp(
        Math.floor(samplePosition),
        0,
        channel.length - 1
      );
      const upperIndex = Math.min(channel.length - 1, lowerIndex + 1);
      const fraction = clamp(samplePosition - lowerIndex, 0, 1);

      return THREE.MathUtils.lerp(
        channel[lowerIndex] || 0,
        channel[upperIndex] || 0,
        fraction
      );
    }

    function sampleOfflineTimeDomain(time, count) {
      const raw = new Float32Array(count);

      if (!decodedAudioBuffer) {
        return raw;
      }

      const sampleRate = decodedAudioBuffer.sampleRate;
      const windowSize = Math.max(32, state.fftSize);
      const centerSample = time * sampleRate;
      const startSample = centerSample - windowSize / 2;

      for (let index = 0; index < count; index++) {
        const position = count <= 1
          ? startSample
          : startSample + (index / (count - 1)) * (windowSize - 1);
        const left = readDecodedSample(decodedAudioBuffer, 0, position);
        const right = decodedAudioBuffer.numberOfChannels > 1
          ? readDecodedSample(decodedAudioBuffer, 1, position)
          : left;

        raw[index] = ((left + right) * 0.5) * state.sensitivity;
      }

      return applySpatialSmoothing(raw);
    }

    function computeOfflineSpectrum(time, fftSizeOverride = state.fftSize) {
      if (!decodedAudioBuffer) {
        return new Float32Array(0);
      }

      const size = Math.max(32, fftSizeOverride);
      const real = new Float64Array(size);
      const imaginary = new Float64Array(size);
      const sampleRate = decodedAudioBuffer.sampleRate;
      const startSample = Math.round(time * sampleRate) - Math.floor(size / 2);

      for (let index = 0; index < size; index++) {
        const position = startSample + index;
        const left = readDecodedSample(decodedAudioBuffer, 0, position);
        const right = decodedAudioBuffer.numberOfChannels > 1
          ? readDecodedSample(decodedAudioBuffer, 1, position)
          : left;
        const windowValue = 0.5 -
          0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));

        real[index] = ((left + right) * 0.5) * windowValue;
      }

      let swapIndex = 0;

      for (let index = 1; index < size; index++) {
        let bit = size >> 1;

        while (swapIndex & bit) {
          swapIndex ^= bit;
          bit >>= 1;
        }

        swapIndex ^= bit;

        if (index < swapIndex) {
          [real[index], real[swapIndex]] = [real[swapIndex], real[index]];
          [imaginary[index], imaginary[swapIndex]] =
            [imaginary[swapIndex], imaginary[index]];
        }
      }

      for (let length = 2; length <= size; length <<= 1) {
        const angle = (-2 * Math.PI) / length;
        const cosineStep = Math.cos(angle);
        const sineStep = Math.sin(angle);

        for (let offset = 0; offset < size; offset += length) {
          let cosine = 1;
          let sine = 0;
          const halfLength = length >> 1;

          for (let index = 0; index < halfLength; index++) {
            const evenIndex = offset + index;
            const oddIndex = evenIndex + halfLength;
            const oddReal =
              real[oddIndex] * cosine - imaginary[oddIndex] * sine;
            const oddImaginary =
              real[oddIndex] * sine + imaginary[oddIndex] * cosine;
            const evenReal = real[evenIndex];
            const evenImaginary = imaginary[evenIndex];

            real[evenIndex] = evenReal + oddReal;
            imaginary[evenIndex] = evenImaginary + oddImaginary;
            real[oddIndex] = evenReal - oddReal;
            imaginary[oddIndex] = evenImaginary - oddImaginary;

            const nextCosine =
              cosine * cosineStep - sine * sineStep;
            sine = sine * cosineStep + cosine * sineStep;
            cosine = nextCosine;
          }
        }
      }

      const magnitudes = new Float32Array(size / 2);

      for (let index = 0; index < magnitudes.length; index++) {
        const magnitude =
          (2 * Math.hypot(real[index], imaginary[index])) / size;
        const decibels = 20 * Math.log10(Math.max(1e-8, magnitude));
        magnitudes[index] = clamp((decibels + 100) / 100, 0, 1);
      }

      return magnitudes;
    }

    function sampleOfflineFrequencyDomain(time, count) {
      const raw = new Float32Array(count);
      const magnitudes = computeOfflineSpectrum(time);

      if (!decodedAudioBuffer || magnitudes.length === 0) {
        return raw;
      }

      const nyquist = decodedAudioBuffer.sampleRate / 2;
      const minimumFrequency = 20;
      const maximumFrequency = Math.max(
        minimumFrequency * 1.01,
        nyquist
      );
      const frequencyRatio = maximumFrequency / minimumFrequency;

      for (let index = 0; index < count; index++) {
        const lowerFrequency =
          minimumFrequency * Math.pow(frequencyRatio, index / count);
        const upperFrequency =
          minimumFrequency *
          Math.pow(frequencyRatio, (index + 1) / count);
        const startBin = clamp(
          Math.floor((lowerFrequency / nyquist) * magnitudes.length),
          0,
          magnitudes.length - 1
        );
        const endBin = clamp(
          Math.max(
            startBin + 1,
            Math.ceil((upperFrequency / nyquist) * magnitudes.length)
          ),
          1,
          magnitudes.length
        );

        let sum = 0;
        let peak = 0;

        for (let bin = startBin; bin < endBin; bin++) {
          const value = magnitudes[bin];
          sum += value;
          peak = Math.max(peak, value);
        }

        const average = sum / Math.max(1, endBin - startBin);
        raw[index] =
          (peak * 0.82 + average * 0.18) * state.sensitivity;
      }

      return applySpatialSmoothing(
        raw,
        state.spatialSmoothing * 0.2
      );
    }

    function appendOfflineWaveformRow(time) {
      const sampled = state.analysisMode === "frequency"
        ? sampleOfflineFrequencyDomain(time, state.count)
        : sampleOfflineTimeDomain(time, state.count);

      commitSampledRow(sampled);
    }

    const HUD_FREQUENCY_POINT_COUNT = 128;
    const HUD_FREQUENCY_MIN_HZ = 20;
    const HUD_FREQUENCY_MAX_HZ = 20000;
    const HUD_FREQUENCY_DB_MIN = -25;
    const HUD_FREQUENCY_DB_MAX = 0;
    const HUD_FREQUENCY_DB_STEP = 5;


    const HUD_ANALYSIS_FRAMES_PER_SECOND = 45;
    const HUD_MAX_ANALYSIS_FRAMES = 3600;
    const HUD_MIN_DB_RANGE = 80;
    const HUD_ATTACK_MS = 45;
    const HUD_RELEASE_MS = 180;
    const BASELINE_VIEWPORT_ASPECT = 16 / 9;
    const BASELINE_CAMERA_VERTICAL_FOV = 50;

    function getViewportFormatName() {
      if (state.aspectRatio === "square") {
        return "square";
      }

      return state.orientation === "portrait"
        ? "portrait"
        : "landscape";
    }

    function catmullRomHud(value0, value1, value2, value3, amount) {
      const amount2 = amount * amount;
      const amount3 = amount2 * amount;

      return 0.5 * (
        (2 * value1) +
        (-value0 + value2) * amount +
        (2 * value0 - 5 * value1 + 4 * value2 - value3) * amount2 +
        (-value0 + 3 * value1 - 3 * value2 + value3) * amount3
      );
    }

    function sampleHudSpectrogramRow(
      data,
      sourcePosition,
      destination
    ) {
      if (sourcePosition < 0 || !data || data.length === 0) {
        destination.fill(0);
        return;
      }

      const lastIndex = data.length - 1;
      const position = clamp(sourcePosition, 0, lastIndex);
      const index1 = Math.floor(position);
      const index2 = Math.min(lastIndex, index1 + 1);
      const index0 = Math.max(0, index1 - 1);
      const index3 = Math.min(lastIndex, index2 + 1);
      const amount = position - index1;
      const row0 = data[index0];
      const row1 = data[index1];
      const row2 = data[index2];
      const row3 = data[index3];

      for (let index = 0; index < destination.length; index++) {
        destination[index] = clamp(
          catmullRomHud(
            row0[index],
            row1[index],
            row2[index],
            row3[index],
            amount
          ),
          0,
          1
        );
      }
    }

    function smoothHudFrequencyGraph(
      data,
      passes = 1,
      frameDurationSeconds = 1 / HUD_ANALYSIS_FRAMES_PER_SECOND
    ) {
      let result = data.map((row) => Float32Array.from(row));

      for (let pass = 0; pass < passes; pass++) {
        result = result.map((row) => {
          const next = new Float32Array(row.length);

          for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
            let weightedSum = row[columnIndex] * 6;
            let totalWeight = 6;

            for (let offset = -2; offset <= 2; offset++) {
              if (offset === 0) {
                continue;
              }

              const neighbor = clamp(
                columnIndex + offset,
                0,
                row.length - 1
              );
              const weight = 1 / (1 + Math.abs(offset) * 0.65);
              weightedSum += row[neighbor] * weight;
              totalWeight += weight;
            }

            next[columnIndex] = weightedSum / totalWeight;
          }

          return next;
        });
      }

      if (result.length <= 1) {
        return result;
      }

      const safeFrameDuration = Math.max(
        1 / 240,
        frameDurationSeconds
      );
      const attackAlpha =
        1 - Math.exp(-safeFrameDuration / (HUD_ATTACK_MS / 1000));
      const releaseAlpha =
        1 - Math.exp(-safeFrameDuration / (HUD_RELEASE_MS / 1000));
      const smoothed = result.map(
        (row) => new Float32Array(row.length)
      );

      smoothed[0].set(result[0]);

      for (let rowIndex = 1; rowIndex < result.length; rowIndex++) {
        const source = result[rowIndex];
        const previous = smoothed[rowIndex - 1];
        const destination = smoothed[rowIndex];

        for (
          let columnIndex = 0;
          columnIndex < source.length;
          columnIndex++
        ) {
          const alpha = source[columnIndex] >= previous[columnIndex]
            ? attackAlpha
            : releaseAlpha;

          destination[columnIndex] =
            previous[columnIndex] +
            (source[columnIndex] - previous[columnIndex]) * alpha;
        }
      }

      return smoothed;
    }

    function computeHudFftMagnitudesAtTime(time, fftSize) {
      if (!decodedAudioBuffer) {
        return new Float32Array(0);
      }

      const size = Math.max(32, fftSize);
      const levels = Math.log2(size);

      if (!Number.isInteger(levels)) {
        throw new Error("FFT size must be a power of two.");
      }

      const real = new Float32Array(size);
      const imaginary = new Float32Array(size);
      const sampleRate = decodedAudioBuffer.sampleRate;
      const centerSample = Math.round(time * sampleRate);
      const startSample = centerSample - Math.floor(size / 2);

      function reverseBits(value, bitCount) {
        let reversed = 0;

        for (let bit = 0; bit < bitCount; bit++) {
          reversed = (reversed << 1) | (value & 1);
          value >>>= 1;
        }

        return reversed;
      }

      for (let index = 0; index < size; index++) {
        const position = startSample + index;
        const left = readDecodedSample(decodedAudioBuffer, 0, position);
        const right = decodedAudioBuffer.numberOfChannels > 1
          ? readDecodedSample(decodedAudioBuffer, 1, position)
          : left;
        const sample = (left + right) * 0.5;
        const windowValue =
          0.5 -
          0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));

        real[reverseBits(index, levels)] = sample * windowValue;
      }

      for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
        const halfBlock = blockSize / 2;
        const phaseStep = (-2 * Math.PI) / blockSize;

        for (
          let blockStart = 0;
          blockStart < size;
          blockStart += blockSize
        ) {
          for (let offset = 0; offset < halfBlock; offset++) {
            const angle = phaseStep * offset;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            const evenIndex = blockStart + offset;
            const oddIndex = evenIndex + halfBlock;
            const oddReal =
              real[oddIndex] * cosine - imaginary[oddIndex] * sine;
            const oddImaginary =
              real[oddIndex] * sine + imaginary[oddIndex] * cosine;

            real[oddIndex] = real[evenIndex] - oddReal;
            imaginary[oddIndex] = imaginary[evenIndex] - oddImaginary;
            real[evenIndex] += oddReal;
            imaginary[evenIndex] += oddImaginary;
          }
        }
      }

      const magnitudes = new Float32Array(size / 2 + 1);

      for (let index = 0; index < magnitudes.length; index++) {
        magnitudes[index] = Math.hypot(real[index], imaginary[index]);
      }

      return magnitudes;
    }

    function sampleHudMagnitudeAtFrequencyRaw(
      magnitudes,
      frequencyHz,
      sampleRate,
      fftSize
    ) {
      const maximumBin = magnitudes.length - 1;
      const binPosition = clamp(
        (frequencyHz * fftSize) / sampleRate,
        0,
        maximumBin
      );
      const lowerBin = Math.floor(binPosition);
      const upperBin = Math.min(maximumBin, lowerBin + 1);
      const amount = binPosition - lowerBin;

      return (
        magnitudes[lowerBin] +
        (magnitudes[upperBin] - magnitudes[lowerBin]) * amount
      );
    }

    function applyViewportCameraProjection(renderTarget) {
      const targetAspect = renderTarget.width / renderTarget.height;
      const baselineVerticalRadians = THREE.MathUtils.degToRad(
        BASELINE_CAMERA_VERTICAL_FOV
      );
      const baselineHorizontalRadians =
        2 * Math.atan(
          Math.tan(baselineVerticalRadians / 2) *
          BASELINE_VIEWPORT_ASPECT
        );

      camera.aspect = targetAspect;
      camera.fov = targetAspect < BASELINE_VIEWPORT_ASPECT
        ? THREE.MathUtils.radToDeg(
            2 * Math.atan(
              Math.tan(baselineHorizontalRadians / 2) / targetAspect
            )
          )
        : BASELINE_CAMERA_VERTICAL_FOV;
      camera.updateProjectionMatrix();
    }

    function hexToHudRgba(hex, alpha = 1) {
      const value = String(hex || "#ffffff").replace("#", "");
      const normalized = value.length === 3
        ? value.split("").map((character) => character + character).join("")
        : value.padEnd(6, "f").slice(0, 6);
      const number = Number.parseInt(normalized, 16);
      const red = (number >> 16) & 255;
      const green = (number >> 8) & 255;
      const blue = number & 255;
      return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
    }

    function getHudColorHex() {
      return state.lightMode
        ? LIGHT_MODE_HUD_COLOR
        : DARK_MODE_HUD_COLOR;
    }

    function getHudRgba(alpha = 1) {
      return hexToHudRgba(getHudColorHex(), alpha);
    }

    function applyViewportColorMode(forceBackground = true) {
      if (forceBackground) {
        state.backgroundColor = state.lightMode
          ? LIGHT_VIEWPORT_BACKGROUND
          : DARK_VIEWPORT_BACKGROUND;
      }

      scene.background.set(state.backgroundColor);
      viewportFrame.style.background = state.backgroundColor;

      const backgroundInput = document.getElementById("backgroundColor");
      if (backgroundInput) {
        backgroundInput.value = state.backgroundColor;
      }

      if (viewportLogo) {
        viewportLogo.style.color = getHudColorHex();
      }

      state.exportLogoImage = null;
      state.exportLogoImageKey = "";
      state.hudLayer = null;
      matrixDirty = true;
    }

    function getHudMeasuredOutputLatency() {
      if (!audioContext || audioContext.state !== "running") {
        return 0;
      }

      const outputLatency = Number(audioContext.outputLatency);
      const baseLatency = Number(audioContext.baseLatency);
      const measuredLatency = Math.max(
        Number.isFinite(outputLatency) ? outputLatency : 0,
        Number.isFinite(baseLatency) ? baseLatency : 0
      );

      return clamp(measuredLatency, 0, 0.25);
    }

    function currentHudPlaybackTime() {
      if (Number.isFinite(state.exportPlaybackTimeOverride)) {
        return state.exportPlaybackTimeOverride;
      }

      const rawTime = Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : 0;
      const duration =
        decodedAudioBuffer?.duration ||
        audio.duration ||
        rawTime;
      const playing =
        Boolean(decodedAudioBuffer) &&
        !audio.paused &&
        !audio.ended;
      const synchronizedTime = clamp(
        rawTime -
          (playing ? getHudMeasuredOutputLatency() : 0),
        0,
        Math.max(0, duration)
      );
      const timestamp = performance.now();

      if (!playing) {
        state.hudSmoothPlaybackValid = false;
        state.hudSmoothPlaybackTime = synchronizedTime;
        state.hudSmoothPlaybackLastTimestamp = timestamp;
        return synchronizedTime;
      }

      if (
        !state.hudSmoothPlaybackValid ||
        !Number.isFinite(state.hudSmoothPlaybackLastTimestamp) ||
        state.hudSmoothPlaybackLastTimestamp <= 0
      ) {
        state.hudSmoothPlaybackValid = true;
        state.hudSmoothPlaybackTime = synchronizedTime;
        state.hudSmoothPlaybackLastTimestamp = timestamp;
        return synchronizedTime;
      }

      const rate = audio.playbackRate || 1;
      const deltaSeconds = Math.min(
        0.1,
        Math.max(
          0,
          (timestamp - state.hudSmoothPlaybackLastTimestamp) / 1000
        )
      );
      state.hudSmoothPlaybackLastTimestamp = timestamp;

      let predicted =
        state.hudSmoothPlaybackTime + deltaSeconds * rate;
      const error = synchronizedTime - predicted;

      if (Math.abs(error) > 0.25) {
        predicted = synchronizedTime;
      } else {
        predicted += error * 0.12;
      }

      predicted = clamp(
        predicted,
        0,
        Math.max(0, duration)
      );
      state.hudSmoothPlaybackTime = predicted;

      return predicted;
    }

        function truncateHudFileName(fileName, maximumLength) {
      const normalized = String(fileName || "NO AUDIO FILE").toUpperCase();
      if (normalized.length <= maximumLength) {
        return normalized;
      }

      const extensionIndex = normalized.lastIndexOf(".");
      const extension = extensionIndex > 0
        ? normalized.slice(extensionIndex)
        : "";
      const baseLength = Math.max(4, maximumLength - extension.length - 1);
      return `${normalized.slice(0, baseLength)}…${extension}`;
    }

    function getHudTextMetrics(width, height) {
      const fontSize = Math.max(6, width * (state.guiTextSize / 100));
      return {
        fontSize,
        lineStep: Math.max(fontSize + 2, fontSize * 1.34),
        x: width * (state.metadataX / 100),
        y: height * (state.metadataY / 100)
      };
    }

    function getHudGraphLayout(width, height, pad) {
      const graphWidth = width * (state.graphWidth / 100);
      const graphHeight = height * (state.graphHeight / 100);
      const graphFontSize = getHudTextMetrics(width, height).fontSize;
      const graphLabelGap = Math.max(4, graphFontSize * 0.55);

      function graphRect(placement) {
        const isRight = placement.endsWith("right");
        const isTop = placement.startsWith("top");
        return {
          x: isRight ? width - pad - graphWidth - 8 : pad + 9,
          y: isTop
            ? pad + graphFontSize + graphLabelGap + 8
            : height - pad - graphHeight - 9,
          width: graphWidth,
          height: graphHeight,
          isRight
        };
      }

      return {
        graphFontSize,
        graphLabelGap,
        frequency: graphRect(state.frequencyGraphPlacement),
        waveform: graphRect(state.waveformGraphPlacement),
        levels: graphRect(state.levelsGraphPlacement)
      };
    }

    function updateViewportLogoLayout() {
      if (!viewportLogo) {
        return;
      }

      const visible = state.hudVisible && state.logoVisible;
      viewportLogo.style.color = getHudColorHex();
      viewportLogo.classList.toggle("is-hidden", !visible);
      viewportLogo.setAttribute("aria-hidden", String(!visible));
      viewportLogo.style.left = `${state.logoX}%`;
      viewportLogo.style.top = `${state.logoY}%`;
      viewportLogo.style.right = "";
      viewportLogo.style.bottom = "";
      viewportLogo.style.width = `${state.logoSize}%`;
      viewportLogo.style.maxWidth = "none";
      viewportLogo.style.transform = "translate(-50%, -50%)";
    }

    async function prepareExportLogoImage() {
      if (!state.hudVisible || !state.logoVisible || !viewportLogo) {
        return null;
      }

      const sourceSvg = viewportLogo.querySelector("svg");
      if (!sourceSvg) {
        return null;
      }

      const viewBox = sourceSvg.getAttribute("viewBox") || "0 0 1280 446";
      const logoColor = getHudColorHex();
      const cacheKey = `${logoColor}|${viewBox}`;
      if (
        state.exportLogoImage &&
        state.exportLogoImageKey === cacheKey
      ) {
        return state.exportLogoImage;
      }

      const clone = sourceSvg.cloneNode(true);
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const viewBoxParts = viewBox.trim().split(/\s+/).map(Number);
      const sourceWidth = viewBoxParts[2] || 1280;
      const sourceHeight = viewBoxParts[3] || 446;
      clone.setAttribute("width", String(sourceWidth));
      clone.setAttribute("height", String(sourceHeight));

      clone
        .querySelectorAll("path, polygon, rect, circle, ellipse")
        .forEach((shape) => {
          shape.setAttribute("fill", logoColor);
          shape.setAttribute("stroke", logoColor);
        });

      const markup = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([markup], {
        type: "image/svg+xml;charset=utf-8"
      });
      const url = URL.createObjectURL(blob);

      try {
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(
            new Error("Viewport logo could not be rasterized.")
          );
          image.src = url;
        });

        state.exportLogoImage = image;
        state.exportLogoImageKey = cacheKey;
        return image;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function drawViewportLogoToCanvas(context, width, height) {
      const image = state.exportLogoImage;
      if (
        !state.hudVisible ||
        !state.logoVisible ||
        !image ||
        !image.naturalWidth ||
        !image.naturalHeight
      ) {
        return;
      }

      const drawWidth = width * (state.logoSize / 100);
      const drawHeight =
        drawWidth * (image.naturalHeight / image.naturalWidth);
      const centerX = width * (state.logoX / 100);
      const centerY = height * (state.logoY / 100);

      context.save();
      context.globalAlpha = 0.92;
      context.drawImage(
        image,
        centerX - drawWidth / 2,
        centerY - drawHeight / 2,
        drawWidth,
        drawHeight
      );
      context.restore();
    }

    function paintHudStaticLayer(context, width, height) {
      const line = getHudRgba(0.90);
      const mesh = getHudRgba(0.50);
      const faint = getHudRgba(0.18);
      const pad = Math.max(10, Math.min(width, height) * 0.018);
      const baseLineWidth = Math.max(0.6, width / 1920);

      context.lineWidth = baseLineWidth;
      context.strokeStyle = line;
      context.fillStyle = line;
      const hudText = getHudTextMetrics(width, height);
      context.font = `${hudText.fontSize}px "Cozette", "CozetteVector", monospace`;
      context.textBaseline = "top";

      context.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

      const tickCount = 10;
      for (let index = 0; index <= tickCount; index++) {
        const x = pad + ((width - pad * 2) * index) / tickCount;
        const y = pad + ((height - pad * 2) * index) / tickCount;
        const tickSize = index % 5 === 0 ? 7 : 4;

        context.beginPath();
        context.moveTo(x, pad);
        context.lineTo(x, pad + tickSize);
        context.moveTo(x, height - pad);
        context.lineTo(x, height - pad - tickSize);
        context.moveTo(pad, y);
        context.lineTo(pad + tickSize, y);
        context.moveTo(width - pad, y);
        context.lineTo(width - pad - tickSize, y);
        context.stroke();
      }

      const maximumFileLength = state.aspectRatio === "square" ? 30 : 38;
      const analysisDescription = state.analysisMode === "frequency"
        ? "LOG-FREQUENCY / SINGLE-SIDED"
        : "TIME-DOMAIN / MIRRORED";
      const staticLines = [
        [0, "SYS/SPECTROGRAMIC VOXEL ENGINE"],
        [1, truncateHudFileName(loadedAudioFileName, maximumFileLength)],
        [3, `VIEW:${getViewportFormatName().toUpperCase()}`],
        [4, `ANALYSIS:${analysisDescription}`],
        [5, `GRID:${state.count}×${state.historyRows} VOXELS`],
        [6, `FFT:${state.fftSize} / CASCADE:${state.cascadeRate} ROWS/S`],
        [7, `GAIN:${state.sensitivity.toFixed(2)}x / MAX HEIGHT:${state.maxHeight.toFixed(2)}`]
      ];

      for (const [lineIndex, text] of staticLines) {
        context.fillText(
          text,
          hudText.x,
          hudText.y + lineIndex * hudText.lineStep
        );
      }


      const layout = getHudGraphLayout(width, height, pad);
      const rectangles = [layout.frequency, layout.waveform, layout.levels];

      context.save();
      context.fillStyle = state.backgroundColor;
      for (const rectangle of rectangles) {
        context.fillRect(
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height
        );
      }
      context.restore();

      function drawGraphLabel(text, rectangle) {
        context.save();
        context.font = `${layout.graphFontSize}px "Cozette", "CozetteVector", monospace`;
        context.fillStyle = line;
        context.textBaseline = "top";
        context.textAlign = rectangle.isRight ? "right" : "left";
        context.fillText(
          text,
          rectangle.isRight ? rectangle.x + rectangle.width : rectangle.x,
          rectangle.y - layout.graphFontSize - layout.graphLabelGap
        );
        context.restore();
      }

      drawGraphLabel("FR MAGNITUDE dB V/V", layout.frequency);
      drawGraphLabel("WAVEFORM", layout.waveform);
      drawGraphLabel("LEVELS dBFS", layout.levels);

      context.strokeStyle = line;
      for (const rectangle of rectangles) {
        context.strokeRect(
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height
        );
      }

      function frequencyToX(frequencyHz) {
        const normalized =
          Math.log10(frequencyHz / HUD_FREQUENCY_MIN_HZ) /
          Math.log10(HUD_FREQUENCY_MAX_HZ / HUD_FREQUENCY_MIN_HZ);
        return layout.frequency.x + normalized * layout.frequency.width;
      }

      context.save();
      context.lineWidth = Math.max(0.35, baseLineWidth * 0.5);
      for (let decade = 10; decade <= 10000; decade *= 10) {
        for (let multiple = 2; multiple <= 9; multiple++) {
          const frequencyHz = decade * multiple;
          if (
            frequencyHz <= HUD_FREQUENCY_MIN_HZ ||
            frequencyHz >= HUD_FREQUENCY_MAX_HZ
          ) {
            continue;
          }

          const x = frequencyToX(frequencyHz);
          context.strokeStyle = getHudRgba(0.08);
          context.beginPath();
          context.moveTo(x, layout.frequency.y);
          context.lineTo(x, layout.frequency.y + layout.frequency.height);
          context.stroke();
        }
      }

      for (const frequencyHz of [100, 1000, 10000]) {
        const x = frequencyToX(frequencyHz);
        context.strokeStyle = faint;
        context.beginPath();
        context.moveTo(x, layout.frequency.y);
        context.lineTo(x, layout.frequency.y + layout.frequency.height);
        context.stroke();
      }

      context.strokeStyle = faint;
      for (
        let db = HUD_FREQUENCY_DB_MIN + HUD_FREQUENCY_DB_STEP;
        db < HUD_FREQUENCY_DB_MAX;
        db += HUD_FREQUENCY_DB_STEP
      ) {
        const normalized =
          (db - HUD_FREQUENCY_DB_MIN) /
          (HUD_FREQUENCY_DB_MAX - HUD_FREQUENCY_DB_MIN);
        const y = layout.frequency.y +
          layout.frequency.height * (1 - normalized);
        context.beginPath();
        context.moveTo(layout.frequency.x, y);
        context.lineTo(layout.frequency.x + layout.frequency.width, y);
        context.stroke();
      }

      for (let index = 1; index < 4; index++) {
        const waveformX = layout.waveform.x +
          (layout.waveform.width * index) / 4;
        context.beginPath();
        context.moveTo(waveformX, layout.waveform.y + 3);
        context.lineTo(
          waveformX,
          layout.waveform.y + layout.waveform.height - 3
        );
        context.stroke();

        const levelX = layout.levels.x + (layout.levels.width * index) / 4;
        context.beginPath();
        context.moveTo(levelX, layout.levels.y + 3);
        context.lineTo(levelX, layout.levels.y + layout.levels.height - 3);
        context.stroke();
      }
      context.restore();
    }

    function ensureHudStaticLayer(width, height) {
      const key = [
        width,
        height,
        state.peakColor,
        state.backgroundColor,
        state.orientation,
        state.aspectRatio,
        loadedAudioFileName,
        state.analysisMode,
        state.count,
        state.historyRows,
        state.fftSize,
        state.cascadeRate,
        state.sensitivity.toFixed(2),
        state.maxHeight.toFixed(2),
        state.frequencyGraphPlacement,
        state.waveformGraphPlacement,
        state.levelsGraphPlacement,
        state.graphWidth.toFixed(2),
        state.graphHeight.toFixed(2),
        state.metadataX.toFixed(2),
        state.metadataY.toFixed(2),
        state.guiTextSize.toFixed(2)
      ].join("|");

      let layer = state.hudLayer;
      if (layer && layer.key === key) {
        return layer;
      }

      if (!layer) {
        layer = { canvas: document.createElement("canvas"), key: "" };
      }

      if (layer.canvas.width !== width || layer.canvas.height !== height) {
        layer.canvas.width = width;
        layer.canvas.height = height;
      }

      const context = layer.canvas.getContext("2d", { alpha: true });
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      paintHudStaticLayer(context, width, height);
      layer.key = key;
      state.hudLayer = layer;
      return layer;
    }

    function ensureHudAudioBuffers() {
      if (
        !state.hudSpectrumBuffer ||
        state.hudSpectrumBuffer.length !== HUD_FREQUENCY_POINT_COUNT
      ) {
        state.hudSpectrumBuffer =
          new Float32Array(HUD_FREQUENCY_POINT_COUNT);
      }

      if (
        !state.hudSpectrumSmoothed ||
        state.hudSpectrumSmoothed.length !== HUD_FREQUENCY_POINT_COUNT
      ) {
        state.hudSpectrumSmoothed =
          new Float32Array(HUD_FREQUENCY_POINT_COUNT);
      }

      if (!state.hudWaveformBuffer || state.hudWaveformBuffer.length !== 128) {
        state.hudWaveformBuffer = new Float32Array(128);
      }
    }

    function getHudSpectrumData() {
      ensureHudAudioBuffers();
      const source = state.hudSpectrumBuffer;
      const smoothed = state.hudSpectrumSmoothed;
      const data = state.frequencySpectrogramData;

      if (!data || data.length === 0 || !decodedAudioBuffer) {
        source.fill(0);
        smoothed.fill(0);
        return smoothed;
      }

      const analysisDuration =
        decodedAudioBuffer.duration || audio.duration;
      const playbackProgress =
        Number.isFinite(analysisDuration) && analysisDuration > 0
          ? clamp(
              currentHudPlaybackTime() / analysisDuration,
              0,
              1
            )
          : 0;
      const sourcePosition =
        playbackProgress * (data.length - 1);

      sampleHudSpectrogramRow(
        data,
        sourcePosition,
        source
      );

      let sourcePeak = 0;

      for (let index = 0; index < source.length; index++) {
        sourcePeak = Math.max(sourcePeak, source[index]);
      }

      if (sourcePeak > 1e-5) {
        for (let index = 0; index < source.length; index++) {
          source[index] /= sourcePeak;
        }
      } else {
        source.fill(0);
      }

      const smoothing = audio.paused ? 1 : 0.72;

      for (let index = 0; index < source.length; index++) {
        smoothed[index] +=
          (source[index] - smoothed[index]) * smoothing;
      }

      let smoothedPeak = 0;

      for (let index = 0; index < smoothed.length; index++) {
        smoothedPeak = Math.max(smoothedPeak, smoothed[index]);
      }

      if (smoothedPeak > 1e-5) {
        for (let index = 0; index < smoothed.length; index++) {
          smoothed[index] /= smoothedPeak;
        }
      }

      return smoothed;
    }

        function getHudWaveformData() {
      ensureHudAudioBuffers();
      const destination = state.hudWaveformBuffer;
      const buffer = decodedAudioBuffer;

      if (!buffer || buffer.length === 0) {
        destination.fill(0);
        return destination;
      }

      const sampleRate = buffer.sampleRate;
      const centerSample = Math.round(
        clamp(currentHudPlaybackTime(), 0, buffer.duration) * sampleRate
      );
      const windowSamples = Math.min(
        buffer.length,
        Math.max(256, Math.round(sampleRate * 0.12))
      );
      const startSample = clamp(
        centerSample - Math.floor(windowSamples * 0.5),
        0,
        Math.max(0, buffer.length - windowSamples)
      );
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channelIndex) => buffer.getChannelData(channelIndex)
      );
      const samplesPerPoint = windowSamples / destination.length;

      for (let pointIndex = 0; pointIndex < destination.length; pointIndex++) {
        const pointStart = Math.floor(startSample + pointIndex * samplesPerPoint);
        const pointEnd = Math.min(
          buffer.length,
          Math.max(
            pointStart + 1,
            Math.floor(startSample + (pointIndex + 1) * samplesPerPoint)
          )
        );
        const step = Math.max(1, Math.floor((pointEnd - pointStart) / 10));
        let strongestSample = 0;

        for (
          let sampleIndex = pointStart;
          sampleIndex < pointEnd;
          sampleIndex += step
        ) {
          let mixedSample = 0;
          for (const channel of channels) {
            mixedSample += (channel[sampleIndex] || 0) / channels.length;
          }

          if (Math.abs(mixedSample) > Math.abs(strongestSample)) {
            strongestSample = mixedSample;
          }
        }

        destination[pointIndex] = clamp(strongestSample, -1, 1);
      }

      return destination;
    }

    function getHudLevelData() {
      const level = state.hudLevel ||
        (state.hudLevel = { peak: 0, rms: 0, peakHold: 0 });
      const buffer = decodedAudioBuffer;

      if (!buffer || buffer.length === 0) {
        level.peak += (0 - level.peak) * 0.2;
        level.rms += (0 - level.rms) * 0.2;
        level.peakHold = Math.max(0, level.peakHold - 0.01);
        return level;
      }

      const sampleRate = buffer.sampleRate;
      const centerSample = Math.round(
        clamp(currentHudPlaybackTime(), 0, buffer.duration) * sampleRate
      );
      const windowSamples = Math.min(
        buffer.length,
        Math.max(256, Math.round(sampleRate * 0.08))
      );
      const startSample = clamp(
        centerSample - (windowSamples >> 1),
        0,
        Math.max(0, buffer.length - windowSamples)
      );
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channelIndex) => buffer.getChannelData(channelIndex)
      );
      const step = Math.max(1, Math.floor(windowSamples / 1024));
      let peak = 0;
      let sumSquares = 0;
      let count = 0;

      for (
        let sampleIndex = startSample;
        sampleIndex < startSample + windowSamples;
        sampleIndex += step
      ) {
        let mixed = 0;
        for (const channel of channels) {
          mixed += (channel[sampleIndex] || 0) / channels.length;
        }
        peak = Math.max(peak, Math.abs(mixed));
        sumSquares += mixed * mixed;
        count++;
      }

      const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
      const paused = audio.paused &&
        !Number.isFinite(state.exportPlaybackTimeOverride);
      level.peak +=
        (peak - level.peak) * (paused ? 1 : peak > level.peak ? 0.6 : 0.25);
      level.rms += (rms - level.rms) * (paused ? 1 : 0.3);

      if (peak >= level.peakHold) {
        level.peakHold = peak;
      } else if (!paused) {
        level.peakHold = Math.max(level.peak, level.peakHold - 0.012);
      }

      return level;
    }

    function drawHudLevelsGraph(
      context,
      rectangle,
      graphFontSize,
      line
    ) {
      const level = getHudLevelData();
      const innerPad = Math.max(2, rectangle.height * 0.16);
      const top = rectangle.y + innerPad;
      const usableHeight = rectangle.height - innerPad * 2;
      const rowGap = Math.max(2, usableHeight * 0.16);
      const rowHeight = (usableHeight - rowGap) / 2;
      const meterFont = Math.max(5, graphFontSize * 0.82);
      const leftPad = Math.max(3, rectangle.width * 0.02);
      const labelWidth = Math.max(14, meterFont * 2.6);
      const labelX = rectangle.x + leftPad;
      const meterX = labelX + labelWidth;
      const meterWidth =
        rectangle.x + rectangle.width - meterX - leftPad;

      context.save();
      context.font = `${meterFont}px "Cozette", "CozetteVector", monospace`;
      context.textBaseline = "middle";

      function drawRow(rowIndex, label, value, hold) {
        const rowY = top + rowIndex * (rowHeight + rowGap);
        const middleY = rowY + rowHeight * 0.5;
        context.textAlign = "left";
        context.fillStyle = line;
        context.fillText(label, labelX, middleY);

        if (meterWidth <= 0) {
          return;
        }

        context.fillStyle = getHudRgba(0.82);
        context.fillRect(
          meterX,
          rowY,
          clamp(value, 0, 1) * meterWidth,
          rowHeight
        );

        if (hold != null) {
          const holdX = meterX + clamp(hold, 0, 1) * meterWidth;
          context.fillStyle = line;
          context.fillRect(
            clamp(holdX - 0.75, meterX, meterX + meterWidth - 1.5),
            rowY,
            1.5,
            rowHeight
          );
        }
      }

      drawRow(0, "PK", level.peak, level.peakHold);
      drawRow(1, "RMS", level.rms, null);
      context.restore();
    }

    function drawViewportHud() {
      renderer.getDrawingBufferSize(hudDrawingBufferSize);
      const width = Math.max(1, Math.round(hudDrawingBufferSize.x));
      const height = Math.max(1, Math.round(hudDrawingBufferSize.y));

      if (hudCanvas.width !== width || hudCanvas.height !== height) {
        hudCanvas.width = width;
        hudCanvas.height = height;
        state.hudLayer = null;
        state.hudSpectrumSmoothed = null;
        rebuildHudCanvasTexture();
      }

      hudContext.setTransform(1, 0, 0, 1, 0, 0);
      hudContext.clearRect(0, 0, width, height);
      const staticLayer = ensureHudStaticLayer(width, height);
      hudContext.drawImage(staticLayer.canvas, 0, 0);

      const line = getHudRgba(0.90);
      const metrics = getHudTextMetrics(width, height);
      hudContext.fillStyle = line;
      hudContext.strokeStyle = line;
      hudContext.font = `${metrics.fontSize}px "Cozette", "CozetteVector", monospace`;
      hudContext.textBaseline = "top";

      const mode = !decodedAudioBuffer
        ? "IDLE"
        : Number.isFinite(state.exportPlaybackTimeOverride) || !audio.paused
          ? "PLAYING"
          : "PAUSED";
      const frameRate = state.exportFrameRateOverride ?? displayedFps;
      hudContext.fillText(
        `MODE:${mode}`,
        metrics.x,
        metrics.y + 2 * metrics.lineStep
      );
      hudContext.fillText(
        `FPS:${Math.round(frameRate || 0)}`,
        metrics.x,
        metrics.y + 8 * metrics.lineStep
      );

      const pad = Math.max(10, Math.min(width, height) * 0.018);
      const layout = getHudGraphLayout(width, height, pad);
      const spectrum = getHudSpectrumData();

      hudContext.save();
      hudContext.beginPath();
      hudContext.rect(
        layout.frequency.x,
        layout.frequency.y,
        layout.frequency.width,
        layout.frequency.height
      );
      hudContext.clip();
      hudContext.beginPath();
      hudContext.moveTo(
        layout.frequency.x,
        layout.frequency.y + layout.frequency.height
      );
      for (let index = 0; index < spectrum.length; index++) {
        const amount = index / Math.max(1, spectrum.length - 1);
        const x = layout.frequency.x + amount * layout.frequency.width;
        const y = layout.frequency.y + layout.frequency.height -
          clamp(spectrum[index], 0, 1) * layout.frequency.height;
        hudContext.lineTo(x, y);
      }
      hudContext.lineTo(
        layout.frequency.x + layout.frequency.width,
        layout.frequency.y + layout.frequency.height
      );
      hudContext.closePath();
      hudContext.fillStyle = getHudRgba(0.19);
      hudContext.fill();
      hudContext.strokeStyle = line;
      hudContext.lineWidth = Math.max(0.65, width / 1920);
      hudContext.stroke();
      hudContext.restore();

      const waveform = getHudWaveformData();
      const waveformY = layout.waveform.y + 3;
      const waveformHeight = layout.waveform.height - 6;
      const waveformMiddleY = waveformY + waveformHeight * 0.5;
      hudContext.beginPath();
      for (let index = 0; index < waveform.length; index++) {
        const amount = index / Math.max(1, waveform.length - 1);
        const x = layout.waveform.x + amount * layout.waveform.width;
        const y = waveformMiddleY - waveform[index] * waveformHeight * 0.44;
        if (index === 0) {
          hudContext.moveTo(x, y);
        } else {
          hudContext.lineTo(x, y);
        }
      }
      hudContext.strokeStyle = line;
      hudContext.lineWidth = Math.max(0.65, width / 1920);
      hudContext.stroke();

      drawHudLevelsGraph(
        hudContext,
        layout.levels,
        layout.graphFontSize,
        line
      );

      if (isExportingVideo || isExportingPng) {
        drawViewportLogoToCanvas(hudContext, width, height);
      }

      hudTexture.needsUpdate = true;
    }

    function renderSceneWithHud() {
      if (state.hudVisible) {
        drawViewportHud();
      }

      renderer.render(scene, camera);

      if (!state.hudVisible) {
        return;
      }

      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(hudScene, hudCamera);
      renderer.autoClear = true;
    }

    function sampleHudMagnitudeAtFrequency(
      magnitudes,
      frequencyHz,
      sampleRate,
      fftSize
    ) {
      if (!magnitudes.length) {
        return 0;
      }

      const exactBin = (frequencyHz * fftSize) / sampleRate;
      const lower = clamp(Math.floor(exactBin), 0, magnitudes.length - 1);
      const upper = Math.min(magnitudes.length - 1, lower + 1);
      return THREE.MathUtils.lerp(
        magnitudes[lower] || 0,
        magnitudes[upper] || 0,
        clamp(exactBin - lower, 0, 1)
      );
    }

    async function rebuildHudFrequencySpectrogram({
      onProgress = null,
      shouldCancel = null
    } = {}) {
      if (!decodedAudioBuffer || decodedAudioBuffer.duration <= 0) {
        state.frequencySpectrogramData = null;
        state.hudSpectrumBuffer = null;
        state.hudSpectrumSmoothed = null;
        state.hudLiveFrequencyDb = null;
        return;
      }

      const duration = decodedAudioBuffer.duration;
      const fftSize = Math.max(32, state.fftSize);
      const maximumFrequency = Math.min(
        HUD_FREQUENCY_MAX_HZ,
        decodedAudioBuffer.sampleRate * 0.5
      );
      const frameCount = Math.min(
        HUD_MAX_ANALYSIS_FRAMES,
        Math.max(
          state.historyRows * 8,
          Math.round(
            duration * HUD_ANALYSIS_FRAMES_PER_SECOND
          )
        )
      );
      const rawRows = Array.from(
        { length: frameCount },
        () => new Float32Array(HUD_FREQUENCY_POINT_COUNT)
      );
      let graphMaximumDb = -Infinity;
      const yieldInterval =
        fftSize >= 16384 ? 2 :
        fftSize >= 8192 ? 4 :
        fftSize >= 4096 ? 8 :
        16;

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        if (shouldCancel?.()) {
          throw new DOMException(
            "HUD analysis cancelled.",
            "AbortError"
          );
        }

        const progress = frameCount === 1
          ? 0
          : frameIndex / (frameCount - 1);
        const time = progress * duration;
        const magnitudes = computeHudFftMagnitudesAtTime(
          time,
          fftSize
        );
        const row = rawRows[frameIndex];

        for (
          let graphIndex = 0;
          graphIndex < HUD_FREQUENCY_POINT_COUNT;
          graphIndex++
        ) {
          const amount =
            graphIndex / (HUD_FREQUENCY_POINT_COUNT - 1);
          const frequencyHz =
            HUD_FREQUENCY_MIN_HZ *
            Math.pow(
              Math.max(
                HUD_FREQUENCY_MIN_HZ,
                maximumFrequency
              ) / HUD_FREQUENCY_MIN_HZ,
              amount
            );
          const magnitude = sampleHudMagnitudeAtFrequencyRaw(
            magnitudes,
            frequencyHz,
            decodedAudioBuffer.sampleRate,
            fftSize
          );
          const db = 20 * Math.log10(
            Math.max(magnitude, 1e-12)
          );

          row[graphIndex] = db;
          graphMaximumDb = Math.max(graphMaximumDb, db);
        }

        const completed = frameIndex + 1;

        if (
          completed === frameCount ||
          completed % yieldInterval === 0
        ) {
          onProgress?.(completed / frameCount);
          await new Promise((resolve) => {
            window.setTimeout(resolve, 0);
          });
        }
      }

      if (shouldCancel?.()) {
        throw new DOMException(
          "HUD analysis cancelled.",
          "AbortError"
        );
      }

      const dynamicRangeDb =
        HUD_FREQUENCY_DB_MAX - HUD_FREQUENCY_DB_MIN;
      const silenceThresholdDb =
        graphMaximumDb - HUD_MIN_DB_RANGE;
      const normalizedRows = rawRows.map((row) => {
        const normalized =
          new Float32Array(HUD_FREQUENCY_POINT_COUNT);
        let rowPeakDb = -Infinity;

        for (let index = 0; index < row.length; index++) {
          rowPeakDb = Math.max(rowPeakDb, row[index]);
        }

        if (
          !Number.isFinite(rowPeakDb) ||
          rowPeakDb <= silenceThresholdDb
        ) {
          return normalized;
        }

        const rowFloorDb = rowPeakDb - dynamicRangeDb;

        for (let index = 0; index < row.length; index++) {
          normalized[index] = clamp(
            (row[index] - rowFloorDb) / dynamicRangeDb,
            0,
            1
          );
        }

        return normalized;
      });

      const frameDuration =
        duration / Math.max(1, frameCount - 1);

      state.frequencySpectrogramData =
        smoothHudFrequencyGraph(
          normalizedRows,
          1,
          frameDuration
        );
      state.hudSpectrumBuffer = null;
      state.hudSpectrumSmoothed = null;
      state.hudLiveFrequencyDb = null;
      state.hudWaveformBuffer = null;
      state.hudLevel = null;
    }

        function getHudFormatPreset() {
      if (state.aspectRatio === "square") {
        return {
          frequencyGraphPlacement: "top-right",
          waveformGraphPlacement: "bottom-left",
          levelsGraphPlacement: "bottom-right",
          graphWidth: 14,
          graphHeight: 4.5,
          metadataX: 2.5,
          metadataY: 2.5,
          guiTextSize: 1.25,
          logoVisible: true,
          logoX: 50,
          logoY: 5,
          logoSize: 10
        };
      }

      if (state.orientation === "portrait") {
        return {
          frequencyGraphPlacement: "top-right",
          waveformGraphPlacement: "bottom-left",
          levelsGraphPlacement: "bottom-right",
          graphWidth: 22,
          graphHeight: 4.5,
          metadataX: 2.75,
          metadataY: 1.5,
          guiTextSize: 1.5,
          logoVisible: true,
          logoX: 50,
          logoY: 3.5,
          logoSize: 14
        };
      }

      return {
        frequencyGraphPlacement: "top-right",
        waveformGraphPlacement: "bottom-left",
        levelsGraphPlacement: "bottom-right",
        graphWidth: 10,
        graphHeight: 4.5,
        metadataX: 1.5,
        metadataY: 2.5,
        guiTextSize: 0.75,
        logoVisible: true,
        logoX: 50,
        logoY: 5,
        logoSize: 5.5
      };
    }

    function applyHudFormatPreset() {
      Object.assign(state, getHudFormatPreset());
      for (const key of [
        "frequencyGraphPlacement",
        "waveformGraphPlacement",
        "levelsGraphPlacement",
        "graphWidth",
        "graphHeight",
        "metadataX",
        "metadataY",
        "guiTextSize",
        "logoVisible",
        "logoX",
        "logoY",
        "logoSize"
      ]) {
        const control = document.getElementById(key);
        if (control) {
          control.value = String(state[key]);
        }
      }
      setOutputValue("graphWidthValue", state.graphWidth, 0, "%");
      setOutputValue("graphHeightValue", state.graphHeight, 1, "%");
      setOutputValue("metadataXValue", state.metadataX, 2, "%");
      setOutputValue("metadataYValue", state.metadataY, 2, "%");
      setOutputValue("guiTextSizeValue", state.guiTextSize, 2, "%");
      setOutputValue("logoXValue", state.logoX, 1, "%");
      setOutputValue("logoYValue", state.logoY, 1, "%");
      setOutputValue("logoSizeValue", state.logoSize, 1, "%");
      const logoVisibleControl = document.getElementById("logoVisible");
      if (logoVisibleControl) {
        logoVisibleControl.checked = state.logoVisible;
      }
      state.hudLayer = null;
      updateViewportLogoLayout();
    }

    function getHistoryValue(age, sampleIndex) {
      if (age >= historyCount) {
        return 0;
      }

      const rowIndex = (historyHead + age) % state.historyRows;
      return historyData[rowIndex * state.count + sampleIndex];
    }

    function calculateFade(age) {
      const normalizedAge = state.historyRows <= 1
        ? 0
        : age / (state.historyRows - 1);

      const denominator = Math.max(0.0001, 1 - state.fadeStart);
      const fadeProgress = clamp(
        (normalizedAge - state.fadeStart) / denominator,
        0,
        1
      );

      const curved = Math.pow(fadeProgress, state.fadeCurve);
      const brightness = THREE.MathUtils.lerp(
        1,
        state.minimumBrightness,
        curved
      );

      const scale = 1 - curved * state.scaleFade;

      return { brightness, scale };
    }

    function updateMaterialGradientUniforms(
      material,
      baseColor,
      fade
    ) {
      const uniforms =
        material.userData.verticalColormapUniforms;

      if (!uniforms) {
        return;
      }

      uniforms.uEnvelopeBaseColor.value.set(baseColor);
      uniforms.uEnvelopePeakColor.value.set(state.peakColor);
      uniforms.uEnvelopeBackgroundColor.value.set(
        state.backgroundColor
      );
      uniforms.uEnvelopeMaximumHeight.value = Math.max(
        0.0001,
        state.maxHeight
      );
      uniforms.uEnvelopeFadeBrightness.value = fade.brightness;
      uniforms.uEnvelopeAmplitudeColor.value =
        state.amplitudeColor ? 1 : 0;
      uniforms.uEnvelopeColormap.value =
        COLORMAP_INDEX[state.amplitudeColormap] ?? 0;
      uniforms.uEnvelopeColormapSensitivity.value =
        state.colormapSensitivity;
      uniforms.uEnvelopeReverseColormap.value =
        state.reverseColormap ? 1 : 0;
    }

    function updateRowVerticalColors(age, fade) {
      const upperMesh = upperRowMeshes[age];
      const undersideMesh = undersideRowMeshes[age];

      if (!upperMesh || !undersideMesh) {
        return;
      }

      updateMaterialGradientUniforms(
        upperMesh.material,
        state.cubeColor,
        fade
      );

      updateMaterialGradientUniforms(
        undersideMesh.material,
        state.undersideColor,
        fade
      );
    }

    function setHiddenInstance(mesh, instanceIndex, z) {
      dummy.position.set(0, 0, z);
      dummy.scale.set(0.0001, 0.0001, 0.0001);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(instanceIndex, dummy.matrix);
    }

    const DISTANCE_SPACING_EXPANSION = 0.06;

    function getProgressiveHorizontalPosition(sampleIndex, age) {
      const centerIndex = (state.count - 1) / 2;
      const centeredIndex = sampleIndex - centerIndex;
      const maximumAge = Math.max(1, state.historyRows - 1);
      const normalizedDepth = age / maximumAge;
      const horizontalSpacing =
        (state.size + state.gap) *
        (1 + DISTANCE_SPACING_EXPANSION * normalizedDepth);

      return centeredIndex * horizontalSpacing;
    }

    function getProgressiveDepthPosition(age) {
      const maximumAge = Math.max(1, state.historyRows - 1);
      const normalizedDistance = age / maximumAge;

      return -age * state.rowSpacing *
        (1 + DISTANCE_SPACING_EXPANSION * normalizedDistance);
    }

    function getHistoryBackZ() {
      return getProgressiveDepthPosition(
        Math.max(0, state.historyRows - 1)
      );
    }

    function getHistoryDepthCenter() {
      return getHistoryBackZ() / 2;
    }

    function updateMatrices() {
      if (
        upperRowMeshes.length !== state.historyRows ||
        undersideRowMeshes.length !== state.historyRows ||
        !matrixDirty
      ) {
        return;
      }

      const frequencyMode =
        state.analysisMode === "frequency";
      const showBlankBlocks =
        historyCount === 0 &&
        (!decodedAudioBuffer || forceBlankHistoryGrid);

      for (let age = 0; age < state.historyRows; age++) {
        const upperMesh = upperRowMeshes[age];
        const undersideMesh = undersideRowMeshes[age];
        const z = getProgressiveDepthPosition(age);
        const fade = calculateFade(age);

        upperMesh.visible = true;
        undersideMesh.visible = !frequencyMode;

        updateRowVerticalColors(age, fade);

        for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
          if (age >= historyCount && !showBlankBlocks) {
            setHiddenInstance(upperMesh, sampleIndex, z);
            setHiddenInstance(undersideMesh, sampleIndex, z);
            continue;
          }

          const sample = showBlankBlocks
            ? 0
            : getHistoryValue(age, sampleIndex);
          const magnitude = Math.abs(sample);
          const x = getProgressiveHorizontalPosition(sampleIndex, age);

          const height = Math.max(
            state.minimumHeight,
            magnitude * state.maxHeight
          );

          const horizontalScale = state.size * fade.scale;
          const depthScale = state.cubeDepth * fade.scale;
          const yScale = height * fade.scale;

          if (frequencyMode) {
            // Traditional 3D spectrogram:
            // X = frequency, Z = time/history, Y = magnitude.
            // Anchor each frequency bar to the single Y=0 baseline.
            dummy.position.set(x, yScale / 2, z);
            dummy.scale.set(
              horizontalScale,
              yScale,
              depthScale
            );
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            upperMesh.setMatrixAt(sampleIndex, dummy.matrix);

            setHiddenInstance(
              undersideMesh,
              sampleIndex,
              z
            );
          } else {
            // Preserve the existing mirrored waveform-envelope mode.
            // Center both mirrored blocks on the shared Y=0 seam using
            // their final faded height so no vertical gap can appear.
            const verticalCenter = yScale / 2;

            dummy.position.set(x, verticalCenter, z);
            dummy.scale.set(
              horizontalScale,
              yScale,
              depthScale
            );
            dummy.rotation.set(0, 0, 0);
            dummy.updateMatrix();
            upperMesh.setMatrixAt(sampleIndex, dummy.matrix);

            dummy.position.set(x, -verticalCenter, z);
            dummy.updateMatrix();
            undersideMesh.setMatrixAt(sampleIndex, dummy.matrix);
          }
        }

        upperMesh.instanceMatrix.needsUpdate = true;
        undersideMesh.instanceMatrix.needsUpdate = true;
      }

      matrixDirty = false;
    }

    function updateLighting() {
      ambientLight.intensity = state.ambientIntensity;
      keyLight.intensity = state.keyIntensity;
      fillLight.intensity = state.fillIntensity;
      keyLight.color.set(state.keyLightColor);
      fillLight.color.set(state.fillLightColor);

      const azimuth = THREE.MathUtils.degToRad(state.lightAzimuth);
      const elevation = THREE.MathUtils.degToRad(state.lightElevation);
      const radius = 125;

      keyLight.position.set(
        Math.cos(elevation) * Math.sin(azimuth) * radius,
        Math.sin(elevation) * radius,
        Math.cos(elevation) * Math.cos(azimuth) * radius
      );

      keyLight.target.position.set(
        0,
        0,
        getHistoryBackZ() * 0.45
      );

      renderer.toneMappingExposure = state.exposure;
      renderer.shadowMap.enabled = state.shadows;
      keyLight.castShadow = state.shadows;

      for (const mesh of [...upperRowMeshes, ...undersideRowMeshes]) {
        mesh.castShadow = state.shadows;
        mesh.receiveShadow = state.shadows;
      }

      const resolution = Number(state.shadowResolution);
      keyLight.shadow.mapSize.set(resolution, resolution);

      if (keyLight.shadow.map) {
        keyLight.shadow.map.dispose();
        keyLight.shadow.map = null;
      }
    }

    const PREVIEW_MIN_RENDER_SCALE = 1.4;
    const PREVIEW_MAX_RENDER_SCALE = 2;

    function getWebpageRenderDimensions() {
      const format = getViewportFormatName();

      if (format === "square") {
        return { width: 1080, height: 1080 };
      }

      return format === "portrait"
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
    }

        function getViewportResolutionDimensions() {
      const format = getViewportFormatName();
      let width = 1920;
      let height = 1080;
      let squareSize = 1080;

      if (state.viewportResolution === "4k") {
        width = 3840;
        height = 2160;
        squareSize = 2160;
      } else if (state.viewportResolution === "2k") {
        width = 2560;
        height = 1440;
        squareSize = 1440;
      }

      if (format === "square") {
        return { width: squareSize, height: squareSize };
      }

      return format === "portrait"
        ? { width: height, height: width }
        : { width, height };
    }

        function updateExportFormatControls() {
      const isSquare = state.aspectRatio === "square";
      const squareOrientationOption =
        orientationInput.querySelector('option[value="square"]');
      const widescreenOption =
        aspectRatioInput.querySelector('option[value="widescreen"]');

      if (widescreenOption) {
        widescreenOption.textContent = state.orientation === "portrait"
          ? "Portrait — 9:16"
          : "Landscape — 16:9";
      }

      if (squareOrientationOption) {
        squareOrientationOption.hidden = !isSquare;
      }

      orientationInput.value = isSquare
        ? "square"
        : state.orientation;
      orientationInput.disabled = isSquare;
      orientationInput.setAttribute(
        "aria-disabled",
        String(isSquare)
      );
      orientationInput.title = isSquare
        ? "Square — 1:1. Orientation does not apply."
        : state.orientation === "portrait"
          ? "Portrait — 9:16 viewport orientation."
          : "Landscape — 16:9 viewport orientation.";
      aspectRatioInput.title = isSquare
        ? "Square — 1:1 viewport aspect ratio."
        : state.orientation === "portrait"
          ? "Portrait — 9:16 viewport aspect ratio."
          : "Landscape — 16:9 viewport aspect ratio.";
    }

        function updateRendererResolution() {
      const rect = viewportFrame.getBoundingClientRect();
      const renderTarget = getWebpageRenderDimensions();
      const displayedWidth = Math.max(1, rect.width);
      const displayedHeight = Math.max(1, rect.height);
      const deviceScale = Math.min(
        clamp(
          window.devicePixelRatio || 1,
          PREVIEW_MIN_RENDER_SCALE,
          PREVIEW_MAX_RENDER_SCALE
        ),
        state.pixelRatio
      );
      const canonicalScale = Math.max(
        0.01,
        Math.min(
          (displayedWidth * deviceScale) / renderTarget.width,
          (displayedHeight * deviceScale) / renderTarget.height,
          1
        )
      );

      applyViewportCameraProjection(renderTarget);

      renderer.setPixelRatio(canonicalScale);
      renderer.setSize(
        renderTarget.width,
        renderTarget.height,
        false
      );
      state.hudLayer = null;
      state.hudSpectrumSmoothed = null;
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
    }

        function fitViewport() {
      const stageRect = viewport.getBoundingClientRect();
      const padding = window.innerWidth <= 760 ? 24 : 44;
      const availableWidth = Math.max(
        220,
        stageRect.width - padding
      );
      const availableHeight = Math.max(
        220,
        stageRect.height - padding
      );
      const renderTarget = getWebpageRenderDimensions();
      const aspect =
        renderTarget.width / renderTarget.height;

      let baseWidth = Math.min(
        availableWidth,
        availableHeight * aspect
      );
      let baseHeight = baseWidth / aspect;
      const scale = state.viewportSize / 100;

      baseWidth *= scale;
      baseHeight *= scale;

      viewportFrame.style.aspectRatio =
        `${renderTarget.width} / ${renderTarget.height}`;
      viewportFrame.style.width =
        `${Math.round(baseWidth)}px`;
      viewportFrame.style.height =
        `${Math.round(baseHeight)}px`;
      viewportFrame.style.background =
        state.backgroundColor;

      updateRendererResolution();
      updateViewportLogoLayout();
    }

        function resetCamera() {
      const depthCenter = getHistoryDepthCenter();

      camera.position.set(
        0,
        state.cameraHeight,
        state.cameraDistance
      );

      controls.target.set(0, 0, depthCenter);
      camera.zoom = state.cameraZoom;
      camera.updateProjectionMatrix();
      controls.update();
    }



    let sinusoidalCameraStartTime = 0;

    function positionSinusoidalCamera(elapsedSeconds) {
      const depthCenter = getHistoryDepthCenter();
      const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
      const horizontalPhase = elapsed * 0.42;
      const verticalPhase = elapsed * 0.31;
      const depthPhase = elapsed * 0.23;

      camera.position.set(
        Math.sin(horizontalPhase) * 72,
        50 + Math.sin(verticalPhase + Math.PI / 2) * 16,
        112 + Math.sin(depthPhase + Math.PI) * 24
      );
      controls.target.set(
        0,
        Math.sin(elapsed * 0.36) * 5,
        depthCenter
      );
      camera.lookAt(controls.target);
    }

    function updateSinusoidalCamera(now) {
      if (!state.sinusoidalCameraActive) {
        return;
      }

      if (!sinusoidalCameraStartTime) {
        sinusoidalCameraStartTime = now;
      }

      positionSinusoidalCamera((now - sinusoidalCameraStartTime) / 1000);
    }

    function markCameraPresetCustom() {
      state.sinusoidalCameraActive = false;
      sinusoidalCameraStartTime = 0;
      controls.autoRotate = state.autoRotate;

      if (cameraPresetInput) {
        cameraPresetInput.value = "custom";
      }
    }

    function applyCameraPreset(
      presetName = cameraPresetInput?.value,
      announce = true
    ) {
      const preset = CAMERA_PRESETS[presetName];

      if (!preset) {
        return;
      }

      const depthCenter = getHistoryDepthCenter();
      const [x, y, z] = preset.position;

      state.sinusoidalCameraActive = preset.motion === "sinusoidal";
      sinusoidalCameraStartTime = state.sinusoidalCameraActive
        ? performance.now()
        : 0;
      controls.autoRotate = state.sinusoidalCameraActive
        ? false
        : state.autoRotate;

      camera.position.set(x, y, z);
      controls.target.set(0, preset.targetHeight || 0, depthCenter);
      state.cameraHeight = y;
      state.cameraDistance = Math.abs(z);

      if (state.sinusoidalCameraActive) {
        positionSinusoidalCamera(0);
      }

      const heightInput = document.getElementById("cameraHeight");
      const distanceInput = document.getElementById("cameraDistance");

      if (heightInput) {
        heightInput.value = String(clamp(y, Number(heightInput.min), Number(heightInput.max)));
      }

      if (distanceInput) {
        distanceInput.value = String(
          clamp(Math.abs(z), Number(distanceInput.min), Number(distanceInput.max))
        );
      }

      setOutputValue("cameraHeightValue", y, 0);
      setOutputValue("cameraDistanceValue", Math.abs(z), 0);
      camera.zoom = state.cameraZoom;
      camera.updateProjectionMatrix();
      controls.update();

      if (announce) {
        status.textContent = `Camera preset: ${cameraPresetInput.options[cameraPresetInput.selectedIndex].text}`;
      }
    }

    function updateOutputAudioLevel() {
      const outputLevel = state.muted
        ? 0
        : clamp(state.volume, 0, 1);

      // Keep the media element neutral so its volume state cannot alter
      // the analyser input used by the visualization.
      audio.volume = 1;
      audio.muted = false;

      if (outputGainNode && audioContext) {
        outputGainNode.gain.setValueAtTime(
          outputLevel,
          audioContext.currentTime
        );
      }
    }

    async function ensureAudioGraph() {
      if (!audioContext) {
        audioContext = new AudioContext();
      }

      if (!sourceNode) {
        sourceNode = audioContext.createMediaElementSource(audio);
        analyser = audioContext.createAnalyser();
        outputGainNode = audioContext.createGain();

        // Analyse the unattenuated signal, then apply volume/mute only
        // after analysis on the route to the user's speakers.
        sourceNode.connect(analyser);
        analyser.connect(outputGainNode);
        outputGainNode.connect(audioContext.destination);
      }

      updateOutputAudioLevel();
      analyser.fftSize = state.fftSize;
      waveformData = new Uint8Array(analyser.fftSize);
      frequencyData = new Uint8Array(
        analyser.frequencyBinCount
      );

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
    }

    async function loadAudioFile(file) {
      if (!file) {
        return;
      }

      audioReady = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      playButton.disabled = true;
      timeline.disabled = true;
      playButton.textContent = "Play";

      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }

      const loadVersion = ++audioLoadVersion;
      loopBpmDetectionVersion++;
      currentObjectUrl = URL.createObjectURL(file);
      loadedAudioFileName = file.name;
      decodedAudioBuffer = null;
      loopWaveformPeaks = null;
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
      setVideoExportStatus("Decoding audio for deterministic export…", "active");
      playButton.disabled = true;
      timeline.disabled = true;
      playButton.textContent = "Play";
      clearHistory();
      hideFftLoadProgress();
      setAudioLoadProgress(2, "Preparing audio reader…");

      try {
        if (!audioContext) {
          audioContext = new AudioContext();
        }

        setAudioLoadProgress(5, "Reading audio file…");
        const fileBytes = await readAudioFileWithProgress(file, loadVersion);

        if (loadVersion !== audioLoadVersion) {
          return;
        }

        setAudioLoadProgress(70, "Decoding audio…");
        const decodedBuffer = await audioContext.decodeAudioData(
          fileBytes.slice(0)
        );

        if (loadVersion !== audioLoadVersion) {
          return;
        }

        setAudioLoadProgress(88, "Building waveform and loop data…");
        await new Promise((resolve) => requestAnimationFrame(resolve));

        decodedAudioBuffer = decodedBuffer;
        initializeLoopSelection(decodedAudioBuffer);
        state.hudLayer = null;
        setAudioLoadProgress(90, "Analyzing viewport frequency graph…");
        await rebuildHudFrequencySpectrogram({
          shouldCancel: () => loadVersion !== audioLoadVersion,
          onProgress: (amount) => {
            setAudioLoadProgress(
              90 + amount * 9,
              `Analyzing viewport frequency graph · ${Math.round(amount * 100)}%`
            );
          }
        });

        if (loadVersion !== audioLoadVersion) {
          return;
        }

        audio.src = currentObjectUrl;
        audio.load();
        syncPlaybackTimeline(0);
        exportVideoButton.disabled = false;
        status.textContent = file.name;
        setVideoExportStatus(
          `Ready · ${formatTime(decodedAudioBuffer.duration)} decoded audio`,
          "idle"
        );
        setAudioLoadProgress(100, "Audio ready");
        audioReady = true;
        playButton.disabled = false;
        timeline.disabled = false;
        hideAudioLoadProgress(900);
      } catch (error) {
        if (loadVersion !== audioLoadVersion) {
          return;
        }

        console.error(error);
        audioReady = false;
        playButton.disabled = true;
        timeline.disabled = true;
        state.loopReady = false;
        state.audioLoop = false;
        loopWaveformPeaks = null;
        syncLoopButton();
        status.textContent = file.name;
        setVideoExportStatus(
          `Audio analysis failed: ${error.message}`,
          "error"
        );
        setAudioLoadProgress(0, "Audio loading failed");
        hideAudioLoadProgress(1600);
      }
    }

    async function togglePlayback() {
      if (!audioReady || playButton.disabled || !audio.src) {
        return;
      }

      try {
        await ensureAudioGraph();

        if (audio.paused) {
          if (state.audioLoop && hasPartialLoopSelection()) {
            const range = getSelectedLoopRange();

            if (
              audio.currentTime < range.start ||
              audio.currentTime >= range.end
            ) {
              audio.currentTime = range.start;
              clearHistory();
            }
          }

          nextCaptureAudioTime = audio.currentTime;
          await audio.play();
        } else {
          audio.pause();
        }
      } catch (error) {
        console.error(error);
        status.textContent = `Audio error: ${error.message}`;
      }
    }

    function synchronizeCascadeToAudioTime() {
      if (!analyser || audio.paused || audio.ended) {
        return;
      }

      const interval = 1 / state.cascadeRate;

      if (
        !Number.isFinite(nextCaptureAudioTime) ||
        audio.currentTime + interval < nextCaptureAudioTime
      ) {
        nextCaptureAudioTime = audio.currentTime;
      }

      let capturedRows = 0;
      const maximumCatchUpRows = 4;

      while (
        audio.currentTime >= nextCaptureAudioTime &&
        capturedRows < maximumCatchUpRows
      ) {
        appendWaveformRow();
        nextCaptureAudioTime += interval;
        capturedRows++;
      }

      if (capturedRows === maximumCatchUpRows) {
        nextCaptureAudioTime = audio.currentTime + interval;
      }
    }

    function updateMaterialControlVisibility() {
      document.querySelectorAll(".material-control").forEach((control) => {
        const supported = control.dataset.materials.split(" ");
        control.hidden = !supported.includes(state.materialType);
      });
    }

    function getSettingsSnapshot() {
      return {
        version: 19,
        type: "three-dimensional-mirrored-envelope-sharper-spectrogram",
        settings: Object.fromEntries(
          Object.keys(defaults).map((key) => [key, state[key]])
        )
      };
    }

    function applySettings(settings) {
      if (!settings || typeof settings !== "object") {
        throw new Error("The settings object is invalid.");
      }

      const hasExplicitLightMode =
        Object.prototype.hasOwnProperty.call(settings, "lightMode");

      for (const key of Object.keys(defaults)) {
        if (Object.prototype.hasOwnProperty.call(settings, key)) {
          const expectedType = typeof defaults[key];

          if (typeof settings[key] === expectedType) {
            state[key] = settings[key];
          }
        }
      }

      if (!ALLOWED_COLORMAPS.has(state.amplitudeColormap)) {
        state.amplitudeColormap = defaults.amplitudeColormap;
      }
      state.minimumHeight = Math.max(0.25, state.minimumHeight);
      state.undersideColor = state.cubeColor;

      audio.playbackRate = state.playbackRate;
      updateOutputAudioLevel();
      applyViewportColorMode(hasExplicitLightMode);
      state.hudLayer = null;
      controls.autoRotate = state.autoRotate;
      controls.autoRotateSpeed = state.autoRotateSpeed;

      syncControlsFromState();
      updateMaterialControlVisibility();

      updateExportFormatControls();
      updateVideoExportFormatUi(false);
      fitViewport();
      updateViewportLogoLayout();
      rebuildWaveform();
      updateLighting();
      resetCamera();

      if (analyser) {
        analyser.fftSize = state.fftSize;
        waveformData = new Uint8Array(analyser.fftSize);
        frequencyData = new Uint8Array(
          analyser.frequencyBinCount
        );
      }

      if (decodedAudioBuffer) {
        rebuildHudFrequencySpectrogram().catch((error) => {
          if (error?.name !== "AbortError") console.error(error);
        });
      }
    }

    function setOutputValue(id, value, decimals = 2, suffix = "") {
      const output = document.getElementById(id);

      if (!output) {
        return;
      }

      const numericValue = Number(value);
      const formattedValue = Number.isFinite(numericValue)
        ? numericValue.toFixed(decimals)
        : "";

      if (output instanceof HTMLInputElement && output.type === "number") {
        output.value = formattedValue;
        return;
      }

      output.value = `${formattedValue}${suffix}`;
    }

    function updateAnalysisModeLabels() {
      const frequencyMode = state.analysisMode === "frequency";
      const resolutionLabel =
        document.getElementById("resolutionLabel");
      const gainLabel = document.getElementById("gainLabel");

      if (resolutionLabel) {
        resolutionLabel.textContent = frequencyMode
          ? "Spectrogram Resolution"
          : "Waveform Resolution";
      }

      if (gainLabel) {
        gainLabel.textContent = frequencyMode
          ? "Spectrogram Gain"
          : "Waveform Gain";
      }
    }

    function syncControlsFromState() {
      const inputIds = Object.keys(defaults);

      for (const id of inputIds) {
        const element = document.getElementById(id);

        if (!element) {
          continue;
        }

        if (element.type === "checkbox") {
          element.checked = Boolean(state[id]);
        } else {
          element.value = String(state[id]);
        }
      }

      setOutputValue("playbackRateValue", state.playbackRate, 2, "×");
      setOutputValue(
        "volumeValue",
        state.volume * 100,
        0,
        "%"
      );
      setOutputValue("sensitivityValue", state.sensitivity, 2);
      setOutputValue(
        "colormapSensitivityValue",
        state.colormapSensitivity,
        2
      );
      setOutputValue("attackValue", state.attack, 2);
      setOutputValue("releaseValue", state.release, 2);
      setOutputValue("spatialSmoothingValue", state.spatialSmoothing, 0);
      setOutputValue("historyBlendValue", state.historyBlend, 2);
      setOutputValue("cascadeRateValue", state.cascadeRate, 0, " fps");

      setOutputValue("countValue", state.count, 0);
      setOutputValue("historyRowsValue", state.historyRows, 0);
      setOutputValue("sizeValue", state.size, 2);
      setOutputValue("cubeDepthValue", state.cubeDepth, 2);

      setOutputValue("gapValue", state.gap, 2);
      setOutputValue("rowSpacingValue", state.rowSpacing, 2);
      setOutputValue("maxHeightValue", state.maxHeight, 1);

      setOutputValue("minimumHeightValue", state.minimumHeight, 2);

      setOutputValue("fadeStartValue", state.fadeStart, 2);
      setOutputValue("fadeCurveValue", state.fadeCurve, 2);
      setOutputValue(
        "minimumBrightnessValue",
        state.minimumBrightness,
        2
      );
      setOutputValue("scaleFadeValue", state.scaleFade, 2);

      setOutputValue("roughnessValue", state.roughness, 2);
      setOutputValue("metalnessValue", state.metalness, 2);
      setOutputValue("clearcoatValue", state.clearcoat, 2);
      setOutputValue(
        "clearcoatRoughnessValue",
        state.clearcoatRoughness,
        2
      );
      setOutputValue("shininessValue", state.shininess, 0);

      setOutputValue(
        "ambientIntensityValue",
        state.ambientIntensity,
        2
      );
      setOutputValue("keyIntensityValue", state.keyIntensity, 2);
      setOutputValue("fillIntensityValue", state.fillIntensity, 2);
      setOutputValue("lightAzimuthValue", state.lightAzimuth, 0, "°");
      setOutputValue(
        "lightElevationValue",
        state.lightElevation,
        0,
        "°"
      );
      setOutputValue("exposureValue", state.exposure, 2);
      setOutputValue("pixelRatioValue", state.pixelRatio, 2);

      setOutputValue("cameraHeightValue", state.cameraHeight, 0);
      setOutputValue(
        "cameraDistanceValue",
        state.cameraDistance,
        0
      );
      setOutputValue("cameraZoomValue", state.cameraZoom, 2, "×");

      setOutputValue(
        "autoRotateSpeedValue",
        state.autoRotateSpeed,
        2,
        "×"
      );
      setOutputValue(
        "viewportSizeValue",
        state.viewportSize,
        0,
        "%"
      );
      setOutputValue("graphWidthValue", state.graphWidth, 0, "%");
      setOutputValue("graphHeightValue", state.graphHeight, 1, "%");
      setOutputValue("metadataXValue", state.metadataX, 2, "%");
      setOutputValue("metadataYValue", state.metadataY, 2, "%");
      setOutputValue("guiTextSizeValue", state.guiTextSize, 2, "%");
      setOutputValue("logoXValue", state.logoX, 1, "%");
      setOutputValue("logoYValue", state.logoY, 1, "%");
      setOutputValue("logoSizeValue", state.logoSize, 1, "%");

      updateAnalysisModeLabels();
    }

    function bindNumber(
      inputId,
      outputId,
      key,
      decimals,
      onChange,
      suffix = "",
      displayMultiplier = 1
    ) {
      const input = document.getElementById(inputId);
      const valueInput = document.getElementById(outputId);

      const applyRangeValue = () => {
        state[key] = Number(input.value);
        setOutputValue(
          outputId,
          state[key] * displayMultiplier,
          decimals,
          suffix
        );
        onChange();
      };

      input.addEventListener("input", applyRangeValue);

      if (valueInput instanceof HTMLInputElement && valueInput.type === "number") {
        const commitExactValue = () => {
          if (valueInput.value.trim() === "") {
            setOutputValue(
              outputId,
              state[key] * displayMultiplier,
              decimals,
              suffix
            );
            return;
          }

          const displayedValue = Number(valueInput.value);
          if (!Number.isFinite(displayedValue)) {
            setOutputValue(
              outputId,
              state[key] * displayMultiplier,
              decimals,
              suffix
            );
            return;
          }

          const minimum = Number(input.min);
          const maximum = Number(input.max);
          const requestedValue = displayedValue / displayMultiplier;
          const clampedValue = clamp(requestedValue, minimum, maximum);

          input.value = String(clampedValue);
          applyRangeValue();
        };

        valueInput.addEventListener("change", commitExactValue);
        valueInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            valueInput.blur();
          }
        });
      }
    }

    function bindColor(inputId, key, onChange) {
      document.getElementById(inputId).addEventListener("input", (event) => {
        state[key] = event.target.value;
        onChange();
      });
    }

    function bindCheckbox(inputId, key, onChange) {
      document.getElementById(inputId).addEventListener("change", (event) => {
        state[key] = event.target.checked;
        onChange();
      });
    }

    function readSavedPresets() {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_PRESET_KEY) || "{}");
      } catch {
        return {};
      }
    }

    function writeSavedPresets(presets) {
      localStorage.setItem(LOCAL_PRESET_KEY, JSON.stringify(presets));
    }

    function refreshSavedPresetList() {
      const select = document.getElementById("savedPresets");
      const presets = readSavedPresets();
      const names = Object.keys(presets).sort((a, b) =>
        a.localeCompare(b)
      );

      select.innerHTML = "";

      if (names.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No saved presets";
        select.appendChild(option);
        return;
      }

      for (const name of names) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      }
    }

    function saveLocalPreset() {
      const name = document.getElementById("presetName").value.trim();

      if (!name) {
        status.textContent = "Enter a preset name before saving.";
        return;
      }

      const presets = readSavedPresets();
      presets[name] = getSettingsSnapshot();
      writeSavedPresets(presets);
      refreshSavedPresetList();

      document.getElementById("savedPresets").value = name;
      status.textContent = `Saved preset: ${name}`;
    }

    function loadLocalPreset() {
      const name = document.getElementById("savedPresets").value;
      const preset = readSavedPresets()[name];

      if (!preset?.settings) {
        status.textContent = "Select a saved preset first.";
        return;
      }

      applySettings(preset.settings);
      status.textContent = `Loaded preset: ${name}`;
    }

    function deleteLocalPreset() {
      const name = document.getElementById("savedPresets").value;

      if (!name) {
        return;
      }

      const presets = readSavedPresets();
      delete presets[name];
      writeSavedPresets(presets);
      refreshSavedPresetList();

      status.textContent = `Deleted preset: ${name}`;
    }

    function applyPerformancePreset() {
      const preset = document.getElementById("performancePreset").value;

      const presets = {
        low: {
          count: 56,
          historyRows: 36,
          fftSize: 512,
          cascadeRate: 15,
          pixelRatio: 1,
          shadows: false
        },
        medium: {
          count: 100,
          historyRows: 72,
          fftSize: 1024,
          cascadeRate: 24,
          pixelRatio: 1.5,
          shadows: false
        },
        high: {
          count: 132,
          historyRows: 104,
          fftSize: 2048,
          cascadeRate: 30,
          pixelRatio: 2,
          shadows: false
        },
        maximum: {
          count: 180,
          historyRows: 160,
          fftSize: 4096,
          cascadeRate: 40,
          pixelRatio: 2,
          shadows: true
        }
      };

      Object.assign(state, presets[preset]);
      syncControlsFromState();
      updateRendererResolution();
      rebuildWaveform();
      updateLighting();
      resetCamera();

      if (analyser) {
        analyser.fftSize = state.fftSize;
        waveformData = new Uint8Array(analyser.fftSize);
        frequencyData = new Uint8Array(
          analyser.frequencyBinCount
        );
      }

      state.hudLayer = null;
      if (decodedAudioBuffer) {
        rebuildHudFrequencySpectrogram().catch((error) => {
          if (error?.name !== "AbortError") console.error(error);
        });
      }

      status.textContent = `Applied ${preset} quality preset.`;
    }

    function exportSettings() {
      const json = JSON.stringify(getSettingsSnapshot(), null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "mirrored-envelope-cascade-pro-settings.json";
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    }

    const isFirefoxBrowser = /Firefox\//i.test(navigator.userAgent);



    function getExportFileBaseName() {
      const customName = sanitizeFileName(exportFileNameInput.value.trim());

      if (customName) {
        return customName;
      }

      const audioName = sanitizeFileName(loadedAudioFileName);

      return audioName || "mirrored-envelope-cascade";
    }

    function downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function canvasToBlob(type = "image/png") {
      return new Promise((resolve, reject) => {
        renderer.domElement.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("The browser could not create the export blob."));
          }
        }, type);
      });
    }

    function setVideoExportStatus(message, tone = "idle") {
      videoExportStatus.textContent = message;
      videoExportStatus.dataset.tone = tone;
      videoExportOverlayStatus.textContent = message;
    }

    function setVideoExportProgress(percent, label = "") {
      const normalized = clamp(Number(percent) || 0, 0, 100);
      const width = `${normalized}%`;

      videoExportProgress.style.width = width;
      videoExportOverlayProgress.style.width = width;

      if (label) {
        videoExportOverlayStatus.textContent = label;
      }
    }

    function beginVideoExportUi() {
      try {
        videoExportOverlay.style.backgroundImage =
          `url("${renderer.domElement.toDataURL("image/png")}")`;
      } catch {
        videoExportOverlay.style.backgroundImage = "none";
      }

      videoExportOverlay.hidden = false;
      videoExportCancel.disabled = false;
      videoExportCancel.textContent = "Cancel Export";
      exportVideoButton.disabled = true;
      exportVideoButton.textContent = "Exporting…";
      setVideoExportProgress(0, "Preparing export…");
    }

    function endVideoExportUi() {
      videoExportOverlay.hidden = true;
      videoExportOverlay.style.backgroundImage = "none";
      videoExportCancel.disabled = false;
      videoExportCancel.textContent = "Cancel Export";
      exportVideoButton.disabled = !decodedAudioBuffer;
      exportVideoButton.textContent = "Export Video";
    }

    function registerVideoExportCancelHandler(handler) {
      videoExportCancelHandlers.add(handler);
      return () => videoExportCancelHandlers.delete(handler);
    }

    async function runVideoExportCancelHandlers() {
      const handlers = [...videoExportCancelHandlers];
      videoExportCancelHandlers.clear();

      await Promise.allSettled(
        handlers.map((handler) => Promise.resolve().then(handler))
      );
    }

    function requestVideoExportCancel() {
      if (!isExportingVideo || videoExportCancelled) {
        return;
      }

      videoExportCancelled = true;
      videoExportCancel.disabled = true;
      videoExportCancel.textContent = "Cancelling…";
      exportVideoButton.textContent = "Cancelling…";
      setVideoExportStatus("Cancelling video export…", "active");
      void runVideoExportCancelHandlers();
    }

    function throwIfVideoExportCancelled() {
      if (videoExportCancelled) {
        throw new DOMException("Video export cancelled.", "AbortError");
      }
    }

    function nextEventLoopTurn() {
      return new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    async function waitForEncoderQueue(encoder, maximumQueueSize) {
      while (
        encoder &&
        encoder.state === "configured" &&
        encoder.encodeQueueSize > maximumQueueSize
      ) {
        throwIfVideoExportCancelled();
        await nextEventLoopTurn();
      }
    }

    function getVideoFrameTiming(frameIndex, frameRate) {
      const timestampUs = Math.round(
        (frameIndex * 1_000_000) / frameRate
      );
      const nextTimestampUs = Math.round(
        ((frameIndex + 1) * 1_000_000) / frameRate
      );

      return {
        timestampUs,
        durationUs: Math.max(1, nextTimestampUs - timestampUs),
        timestampSeconds: frameIndex / frameRate,
        durationSeconds: 1 / frameRate
      };
    }

    function getEffectiveVideoBitrate(baseBitrateMbps, width, height) {
      const pixelRatio = (width * height) / (1920 * 1080);
      const scaledMbps =
        baseBitrateMbps * Math.sqrt(Math.max(1, pixelRatio));

      return Math.round(scaledMbps * 1_000_000);
    }

    async function loadMp4MuxerModule() {
      if (!Mp4MuxerModule) {
        Mp4MuxerModule = await import(
          "https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm"
        );
      }

      return Mp4MuxerModule;
    }

    async function loadMediabunnyModule() {
      if (!MediabunnyModule) {
        MediabunnyModule = await import(
          "https://cdn.jsdelivr.net/npm/mediabunny@1.49.0/+esm"
        );
      }

      return MediabunnyModule;
    }

    async function chooseSupportedAvcConfig(
      width,
      height,
      bitrate,
      frameRate
    ) {
      const candidates = [
        "avc1.640033",
        "avc1.64002A",
        "avc1.4D402A",
        "avc1.42001F"
      ];
      const qualityProfiles = [
        {
          latencyMode: "quality",
          bitrateMode: "variable",
          hardwareAcceleration: "no-preference"
        },
        {
          latencyMode: "quality",
          hardwareAcceleration: "no-preference"
        },
        {
          bitrateMode: "variable",
          hardwareAcceleration: "no-preference"
        }
      ];

      for (const codec of candidates) {
        for (const qualityProfile of qualityProfiles) {
          const config = {
            codec,
            width,
            height,
            bitrate,
            framerate: frameRate,
            avc: { format: "avc" },
            ...qualityProfile
          };
          const result = await VideoEncoder.isConfigSupported(config);

          if (result.supported) {
            return result.config;
          }
        }
      }

      return null;
    }

    async function chooseSupportedAacConfig(sampleRate) {
      if (!window.AudioEncoder || !window.AudioData) {
        return null;
      }

      const config = {
        codec: "mp4a.40.2",
        sampleRate,
        numberOfChannels: 2,
        bitrate: 192_000
      };
      const result = await AudioEncoder.isConfigSupported(config);

      return result.supported ? result.config : null;
    }

    function createExportAudioBufferSegment(buffer, start, end) {
      const sampleRate = buffer.sampleRate;
      const startFrame = clamp(
        Math.floor(start * sampleRate),
        0,
        buffer.length
      );
      const endFrame = clamp(
        Math.ceil(end * sampleRate),
        startFrame,
        buffer.length
      );
      const frameCount = Math.max(1, endFrame - startFrame);
      const segment = new AudioBuffer({
        length: frameCount,
        numberOfChannels: Math.max(1, buffer.numberOfChannels),
        sampleRate
      });
      const gain = state.muted ? 0 : clamp(state.volume, 0, 1);

      for (
        let channelIndex = 0;
        channelIndex < segment.numberOfChannels;
        channelIndex++
      ) {
        const sourceChannel = buffer.getChannelData(
          Math.min(channelIndex, buffer.numberOfChannels - 1)
        );
        const destinationChannel = segment.getChannelData(channelIndex);

        for (let index = 0; index < frameCount; index++) {
          destinationChannel[index] =
            (sourceChannel[startFrame + index] || 0) * gain;
        }
      }

      return segment;
    }

    async function encodeAudioIntoMuxer(
      muxer,
      buffer,
      exportStart,
      exportEnd,
      audioConfig
    ) {
      if (!audioConfig) {
        return { encoded: false, reason: "AAC encoding unavailable." };
      }

      const sampleRate = audioConfig.sampleRate;
      const startFrame = clamp(
        Math.floor(exportStart * sampleRate),
        0,
        buffer.length
      );
      const endFrame = clamp(
        Math.ceil(exportEnd * sampleRate),
        startFrame,
        buffer.length
      );
      const chunkSize = 2048;
      const gain = state.muted ? 0 : clamp(state.volume, 0, 1);
      let encoderError = null;
      let audioEncoder = null;

      audioEncoder = new AudioEncoder({
        output: (chunk, metadata) => {
          muxer.addAudioChunk(chunk, metadata);
        },
        error: (error) => {
          encoderError = error;
        }
      });
      audioEncoder.configure(audioConfig);

      const unregisterCancel = registerVideoExportCancelHandler(() => {
        if (audioEncoder?.state === "configured") {
          audioEncoder.reset();
        }
      });

      try {
        for (
          let offset = startFrame;
          offset < endFrame;
          offset += chunkSize
        ) {
          throwIfVideoExportCancelled();

          const frameCount = Math.min(chunkSize, endFrame - offset);
          const planarData = new Float32Array(frameCount * 2);

          for (let channelIndex = 0; channelIndex < 2; channelIndex++) {
            const channel = buffer.getChannelData(
              Math.min(channelIndex, buffer.numberOfChannels - 1)
            );
            const destinationOffset = channelIndex * frameCount;

            for (let index = 0; index < frameCount; index++) {
              planarData[destinationOffset + index] =
                (channel[offset + index] || 0) * gain;
            }
          }

          const audioData = new AudioData({
            format: "f32-planar",
            sampleRate,
            numberOfFrames: frameCount,
            numberOfChannels: 2,
            timestamp: Math.round(
              ((offset - startFrame) / sampleRate) * 1_000_000
            ),
            data: planarData
          });

          audioEncoder.encode(audioData);
          audioData.close();
          await waitForEncoderQueue(audioEncoder, 8);

          if (encoderError) {
            throw encoderError;
          }
        }

        await audioEncoder.flush();

        if (encoderError) {
          throw encoderError;
        }

        return { encoded: true };
      } finally {
        unregisterCancel();

        if (audioEncoder?.state !== "closed") {
          audioEncoder.close();
        }
      }
    }

    async function renderVideoExportFrames({
      frameRate,
      totalFrames,
      duration,
      exportStart,
      exportEnd,
      startingCameraPosition,
      startingTarget,
      addFrame
    }) {
      let nextRowTime = exportStart;
      const baseOffset = startingCameraPosition
        .clone()
        .sub(startingTarget);
      const rotationAxis = new THREE.Vector3(0, 1, 0);

      for (
        let frameIndex = 0;
        frameIndex < totalFrames;
        frameIndex++
      ) {
        throwIfVideoExportCancelled();

        const elapsedExportTime = Math.min(
          duration,
          frameIndex / frameRate
        );
        const exportTime = Math.min(
          exportEnd,
          exportStart + elapsedExportTime
        );
        state.exportPlaybackTimeOverride = exportTime;
        state.exportFrameRateOverride = frameRate;

        while (nextRowTime <= exportTime + 1e-8) {
          appendOfflineWaveformRow(nextRowTime);
          nextRowTime += 1 / state.cascadeRate;
        }

        if (state.sinusoidalCameraActive) {
          positionSinusoidalCamera(elapsedExportTime);
        } else if (state.autoRotate) {
          const angle =
            -elapsedExportTime * state.autoRotateSpeed * 0.2;
          camera.position
            .copy(baseOffset)
            .applyAxisAngle(rotationAxis, angle)
            .add(startingTarget);
          camera.lookAt(startingTarget);
        }

        updateMatrices();
        renderSceneWithHud();

        // Capture the WebGL frame in the same task that rendered it. The
        // renderer uses the default non-preserved drawing buffer, so yielding
        // before VideoFrame/CanvasSource reads the canvas can expose a cleared
        // or partially composited buffer and produce flickering export frames.
        const gl = renderer.getContext();
        if (typeof gl.finish === "function") {
          gl.finish();
        }

        throwIfVideoExportCancelled();
        await addFrame(frameIndex);
        await nextEventLoopTurn();
        throwIfVideoExportCancelled();

        if (
          frameIndex % Math.max(1, Math.round(frameRate / 3)) === 0
        ) {
          const percent = Math.min(
            90,
            Math.round(((frameIndex + 1) / totalFrames) * 90)
          );
          const frameLabel =
            `Encoding frame ${frameIndex + 1} of ${totalFrames}`;

          setVideoExportStatus(
            `${percent}% · ${frameLabel}`,
            "active"
          );
          setVideoExportProgress(percent, frameLabel);
        }
      }
    }

    async function exportMp4({
      resolution,
      frameRate,
      videoBitrate,
      duration,
      exportStart,
      exportEnd,
      totalFrames,
      startingCameraPosition,
      startingTarget
    }) {
      const { Muxer, ArrayBufferTarget } =
        await loadMp4MuxerModule();
      throwIfVideoExportCancelled();

      const videoConfig = await chooseSupportedAvcConfig(
        resolution.width,
        resolution.height,
        videoBitrate,
        frameRate
      );

      if (!videoConfig) {
        throw new Error(
          "No supported H.264 configuration was found for this resolution."
        );
      }

      const audioConfig = await chooseSupportedAacConfig(
        decodedAudioBuffer.sampleRate
      );
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        video: {
          codec: "avc",
          width: resolution.width,
          height: resolution.height
        },
        ...(audioConfig
          ? {
              audio: {
                codec: "aac",
                sampleRate: audioConfig.sampleRate,
                numberOfChannels: 2
              }
            }
          : {}),
        fastStart: "in-memory"
      });

      let encoderError = null;
      let encodedVideoFrameCount = 0;
      let videoEncoder = new VideoEncoder({
        output: (chunk, metadata) => {
          encodedVideoFrameCount++;
          muxer.addVideoChunk(chunk, metadata);
        },
        error: (error) => {
          encoderError = error;
        }
      });

      videoEncoder.configure(videoConfig);

      const unregisterCancel = registerVideoExportCancelHandler(() => {
        if (videoEncoder?.state === "configured") {
          videoEncoder.reset();
        }
      });

      try {
        await renderVideoExportFrames({
          frameRate,
          totalFrames,
          duration,
          exportStart,
          exportEnd,
          startingCameraPosition,
          startingTarget,
          addFrame: async (frameIndex) => {
            throwIfVideoExportCancelled();

            if (encoderError) {
              throw encoderError;
            }

            const timing = getVideoFrameTiming(
              frameIndex,
              frameRate
            );
            const frame = new VideoFrame(renderer.domElement, {
              timestamp: timing.timestampUs,
              duration: timing.durationUs
            });

            videoEncoder.encode(frame, {
              keyFrame:
                frameIndex % Math.max(1, frameRate * 2) === 0
            });
            frame.close();

            await waitForEncoderQueue(videoEncoder, 1);

            if (encoderError) {
              throw encoderError;
            }
          }
        });

        await videoEncoder.flush();

        if (encodedVideoFrameCount !== totalFrames) {
          throw new Error(
            `Video encoder returned ${encodedVideoFrameCount} of ` +
            `${totalFrames} frames. Try a lower resolution.`
          );
        }

        setVideoExportProgress(92, "Encoding audio…");

        if (audioConfig) {
          await encodeAudioIntoMuxer(
            muxer,
            decodedAudioBuffer,
            exportStart,
            exportEnd,
            audioConfig
          );
        }

        throwIfVideoExportCancelled();
        setVideoExportProgress(98, "Finalizing MP4…");
        muxer.finalize();

        const blob = new Blob([target.buffer], {
          type: "video/mp4"
        });
        downloadBlob(blob, `${getExportFileBaseName()}.mp4`);

        return {
          label: audioConfig ? "MP4 with AAC audio" : "video-only MP4",
          size: blob.size
        };
      } finally {
        unregisterCancel();

        if (videoEncoder?.state !== "closed") {
          videoEncoder.close();
        }

        videoEncoder = null;
      }
    }

    async function exportMkv({
      resolution,
      frameRate,
      videoBitrate,
      duration,
      exportStart,
      exportEnd,
      totalFrames,
      startingCameraPosition,
      startingTarget
    }) {
      const {
        Output,
        MkvOutputFormat,
        BufferTarget,
        CanvasSource,
        AudioBufferSource,
        getFirstEncodableVideoCodec,
        getFirstEncodableAudioCodec
      } = await loadMediabunnyModule();
      throwIfVideoExportCancelled();

      const preferredVideoCodecs = isFirefoxBrowser
        ? ["vp9", "vp8", "av1", "avc"]
        : ["avc", "vp9", "vp8", "av1"];
      const selectedVideoCodec =
        await getFirstEncodableVideoCodec(preferredVideoCodecs, {
          width: resolution.width,
          height: resolution.height,
          bitrate: videoBitrate
        });

      if (!selectedVideoCodec) {
        throw new Error(
          "No supported MKV video codec was found for this resolution."
        );
      }

      const selectedAudioCodec =
        await getFirstEncodableAudioCodec(["opus", "aac"], {
          numberOfChannels: 2,
          sampleRate: 48_000,
          bitrate: 192_000
        });
      const target = new BufferTarget();
      const output = new Output({
        format: new MkvOutputFormat(),
        target
      });
      const videoSource = new CanvasSource(renderer.domElement, {
        codec: selectedVideoCodec,
        bitrate: videoBitrate,
        bitrateMode: "variable",
        latencyMode: "quality",
        keyFrameInterval: 2,
        hardwareAcceleration: "no-preference"
      });
      const audioSource = selectedAudioCodec
        ? new AudioBufferSource({
            codec: selectedAudioCodec,
            bitrate: 192_000,
            transform: {
              numberOfChannels: 2,
              sampleRate: 48_000
            }
          })
        : null;

      output.addVideoTrack(videoSource, { frameRate });

      if (audioSource) {
        output.addAudioTrack(audioSource);
      }

      await output.start();

      const unregisterCancel = registerVideoExportCancelHandler(async () => {
        try {
          videoSource.close();
          audioSource?.close();
          await output.cancel();
        } catch {
          // The encoder may already be closing.
        }
      });

      try {
        const audioPromise = audioSource
          ? audioSource
              .add(
                createExportAudioBufferSegment(
                  decodedAudioBuffer,
                  exportStart,
                  exportEnd
                )
              )
              .finally(() => audioSource.close())
          : Promise.resolve();

        await renderVideoExportFrames({
          frameRate,
          totalFrames,
          duration,
          exportStart,
          exportEnd,
          startingCameraPosition,
          startingTarget,
          addFrame: (frameIndex) => {
            const timing = getVideoFrameTiming(
              frameIndex,
              frameRate
            );

            return videoSource.add(
              timing.timestampSeconds,
              timing.durationSeconds,
              {
                keyFrame:
                  frameIndex % Math.max(1, frameRate * 2) === 0
              }
            );
          }
        });

        videoSource.close();
        setVideoExportProgress(92, "Finishing MKV audio…");
        await audioPromise;
        throwIfVideoExportCancelled();
        setVideoExportProgress(98, "Finalizing MKV…");
        await output.finalize();

        if (!target.buffer) {
          throw new Error("MKV finalization returned no data.");
        }

        const blob = new Blob([target.buffer], {
          type: "video/x-matroska"
        });
        downloadBlob(blob, `${getExportFileBaseName()}.mkv`);

        return {
          label:
            `MKV with ${selectedVideoCodec.toUpperCase()}` +
            (selectedAudioCodec
              ? ` and ${selectedAudioCodec.toUpperCase()} audio`
              : ""),
          size: blob.size
        };
      } finally {
        unregisterCancel();
      }
    }

    async function exportPng() {
      if (isExportingPng || isExportingVideo) {
        return;
      }

      const button = document.getElementById("pngButton");
      const resolution = getViewportResolutionDimensions();
      const renderTarget = getWebpageRenderDimensions();

      isExportingPng = true;
      button.disabled = true;
      button.textContent = "Exporting…";

      try {
        await prepareExportLogoImage();
        renderer.setPixelRatio(1);
        renderer.setSize(
          resolution.width,
          resolution.height,
          false
        );
        applyViewportCameraProjection(renderTarget);
        state.hudLayer = null;
        renderSceneWithHud();

        const blob = await canvasToBlob("image/png");
        downloadBlob(
          blob,
          `${getExportFileBaseName()}-${resolution.width}x` +
          `${resolution.height}.png`
        );
        status.textContent =
          `PNG exported at ${resolution.width} × ${resolution.height}.`;
      } catch (error) {
        console.error(error);
        status.textContent = `PNG export error: ${error.message}`;
      } finally {
        isExportingPng = false;
        button.disabled = false;
        button.textContent = "Export PNG";
        fitViewport();
        renderSceneWithHud();
      }
    }

    async function exportVideo() {
      if (isExportingVideo) {
        requestVideoExportCancel();
        return;
      }

      if (!decodedAudioBuffer) {
        setVideoExportStatus(
          "Load and finish analyzing an audio file before exporting video.",
          "error"
        );
        return;
      }

      if (!window.VideoEncoder || !window.VideoFrame) {
        setVideoExportStatus(
          "Video export requires WebCodecs support. Use a current Chromium or Firefox browser.",
          "error"
        );
        return;
      }

      let fileType = videoFileTypeInput.value;

      if (isFirefoxBrowser && fileType === "mp4") {
        fileType = "mkv";
        videoFileTypeInput.value = "mkv";
        state.videoFileType = "mkv";
      }

      const resolution = getViewportResolutionDimensions();
      const renderTarget = getWebpageRenderDimensions();
      const frameRate =
        Number(videoFrameRateInput.value) || state.videoFrameRate;
      const baseBitrate =
        Number(videoBitrateInput.value) || state.videoBitrate;
      const videoBitrate = getEffectiveVideoBitrate(
        baseBitrate,
        resolution.width,
        resolution.height
      );
      const exportRange = getVideoExportRange();
      const duration = exportRange.duration;
      const totalFrames = Math.max(
        1,
        Math.ceil(duration * frameRate)
      );
      const saved = {
        audioTime: audio.currentTime,
        audioWasPlaying: !audio.paused && !audio.ended,
        cameraPosition: camera.position.clone(),
        cameraQuaternion: camera.quaternion.clone(),
        controlsTarget: controls.target.clone(),
        controlsAutoRotate: controls.autoRotate,
        historyData: historyData.slice(),
        smoothedSamples: smoothedSamples.slice(),
        historyHead,
        historyCount,
        forceBlankHistoryGrid,
        matrixDirty,
        exportPlaybackTimeOverride: state.exportPlaybackTimeOverride,
        exportFrameRateOverride: state.exportFrameRateOverride,
        hudSpectrumSmoothed: state.hudSpectrumSmoothed
          ? state.hudSpectrumSmoothed.slice()
          : null,
        hudLevel: state.hudLevel ? { ...state.hudLevel } : null
      };

      isExportingVideo = true;
      videoExportCancelled = false;
      beginVideoExportUi();
      audio.pause();
      controls.autoRotate = false;

      try {
        await prepareExportLogoImage();
        renderer.setPixelRatio(1);
        renderer.setSize(
          resolution.width,
          resolution.height,
          false
        );
        applyViewportCameraProjection(renderTarget);

        historyData.fill(0);
        smoothedSamples.fill(0);
        historyHead = 0;
        historyCount = 0;
        matrixDirty = true;
        state.hudLayer = null;
        state.hudSpectrumSmoothed = null;
        state.hudLevel = null;
        state.exportFrameRateOverride = frameRate;

        setVideoExportStatus(
          `Preparing ${fileType.toUpperCase()} · ` +
          `${resolution.width} × ${resolution.height} · ` +
          `${frameRate} FPS · ` +
          (hasPartialLoopSelection() && state.audioLoop
            ? `loop ${formatTime(exportRange.start)}–${formatTime(exportRange.end)}`
            : "full track"),
          "active"
        );

        const result = fileType === "mkv"
          ? await exportMkv({
              resolution,
              frameRate,
              videoBitrate,
              duration,
              exportStart: exportRange.start,
              exportEnd: exportRange.end,
              totalFrames,
              startingCameraPosition: saved.cameraPosition,
              startingTarget: saved.controlsTarget
            })
          : await exportMp4({
              resolution,
              frameRate,
              videoBitrate,
              duration,
              exportStart: exportRange.start,
              exportEnd: exportRange.end,
              totalFrames,
              startingCameraPosition: saved.cameraPosition,
              startingTarget: saved.controlsTarget
            });

        throwIfVideoExportCancelled();
        const sizeMb = (result.size / (1024 * 1024)).toFixed(1);

        setVideoExportProgress(100, "Export complete.");
        setVideoExportStatus(
          `${result.label} exported · ${sizeMb} MB`,
          "idle"
        );
      } catch (error) {
        if (
          videoExportCancelled ||
          error?.name === "AbortError"
        ) {
          setVideoExportStatus("Video export cancelled.", "idle");
        } else {
          console.error(error);
          setVideoExportStatus(
            `Video export error: ${error.message}`,
            "error"
          );
        }
      } finally {
        await runVideoExportCancelHandlers();

        historyData = saved.historyData;
        smoothedSamples = saved.smoothedSamples;
        historyHead = saved.historyHead;
        historyCount = saved.historyCount;
        forceBlankHistoryGrid = saved.forceBlankHistoryGrid;
        matrixDirty = true;
        state.exportPlaybackTimeOverride = saved.exportPlaybackTimeOverride;
        state.exportFrameRateOverride = saved.exportFrameRateOverride;
        state.hudSpectrumSmoothed = saved.hudSpectrumSmoothed;
        state.hudLevel = saved.hudLevel;
        state.hudLayer = null;

        camera.position.copy(saved.cameraPosition);
        camera.quaternion.copy(saved.cameraQuaternion);
        controls.target.copy(saved.controlsTarget);
        controls.autoRotate = saved.controlsAutoRotate;
        controls.update();

        audio.currentTime = Math.min(
          saved.audioTime,
          audio.duration || saved.audioTime
        );
        nextCaptureAudioTime = audio.currentTime;

        isExportingVideo = false;
        videoExportCancelled = false;
        fitViewport();
        updateMatrices();
        renderSceneWithHud();
        endVideoExportUi();

        if (saved.audioWasPlaying) {
          try {
            await ensureAudioGraph();
            await audio.play();
          } catch (error) {
            console.error(error);
          }
        }
      }
    }

    function updateVideoExportFormatUi(announce = false) {
      if (isFirefoxBrowser) {
        const mp4Option =
          videoFileTypeInput.querySelector('option[value="mp4"]');

        if (mp4Option) {
          mp4Option.disabled = true;
        }

        if (videoFileTypeInput.value === "mp4") {
          videoFileTypeInput.value = "mkv";
        }
      }

      state.videoFileType = videoFileTypeInput.value;

      if (announce && isFirefoxBrowser) {
        setVideoExportStatus(
          "Firefox uses MKV because its H.264 metadata is not reliable for MP4 muxing.",
          "idle"
        );
      }
    }

    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        viewport.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    }

    audioFileInput.addEventListener("change", (event) => {
      loadAudioFile(event.target.files?.[0]);
    });

    playButton.addEventListener("click", togglePlayback);
    clearButton.addEventListener("click", () => clearHistory(true));
    loopButton.addEventListener("click", () => loopModalController.open());

    audio.addEventListener("play", () => {
      playButton.textContent = "Pause";
      nextCaptureAudioTime = audio.currentTime;
    });

    audio.addEventListener("pause", () => {
      playButton.textContent = "Play";
    });

    audio.addEventListener("ended", () => {
      playButton.textContent = "Play";
    });

    audio.addEventListener("loadedmetadata", () => {
      syncPlaybackTimeline(audio.currentTime || 0);
      syncLoopButton();
    });

    audio.addEventListener("seeked", () => {
      loopWrapPending = false;
      syncPlaybackTimeline(audio.currentTime);
    });

    audio.addEventListener("timeupdate", () => {
      if (!isSeeking) {
        syncPlaybackTimeline(audio.currentTime);
      }
    });

    timeline.addEventListener("pointerdown", () => {
      isSeeking = true;
    });

    timeline.addEventListener("input", () => {
      syncPlaybackTimeline(audio.currentTime, true);
    });

    function commitTimelineSeek() {
      audio.currentTime = audioTimeFromTimelineValue(timeline.value);
      nextCaptureAudioTime = audio.currentTime;
      isSeeking = false;
      syncPlaybackTimeline(audio.currentTime);
      clearHistory();
      syncLoopButton();
    }

    timeline.addEventListener("change", commitTimelineSeek);

    timeline.addEventListener("pointerup", () => {
      if (isSeeking) {
        commitTimelineSeek();
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      viewport.addEventListener(eventName, (event) => {
        event.preventDefault();
        viewport.classList.add("drop-active");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      viewport.addEventListener(eventName, (event) => {
        event.preventDefault();
        viewport.classList.remove("drop-active");
      });
    });

    viewport.addEventListener("drop", (event) => {
      const file = [...event.dataTransfer.files].find((item) =>
        item.type.startsWith("audio/")
      );

      loadAudioFile(file);
    });

    bindNumber(
      "playbackRate",
      "playbackRateValue",
      "playbackRate",
      2,
      () => {
        audio.playbackRate = state.playbackRate;
      },
      "×"
    );

    bindNumber(
      "volume",
      "volumeValue",
      "volume",
      0,
      () => {
        updateOutputAudioLevel();
      },
      "%",
      100
    );

    bindCheckbox("muted", "muted", () => {
      updateOutputAudioLevel();
    });

    bindNumber(
      "sensitivity",
      "sensitivityValue",
      "sensitivity",
      2,
      () => { state.hudLayer = null; }
    );

    bindNumber("attack", "attackValue", "attack", 2, () => {});
    bindNumber("release", "releaseValue", "release", 2, () => {});

    bindNumber(
      "spatialSmoothing",
      "spatialSmoothingValue",
      "spatialSmoothing",
      0,
      () => {}
    );

    bindNumber(
      "historyBlend",
      "historyBlendValue",
      "historyBlend",
      2,
      () => {}
    );

    bindNumber(
      "cascadeRate",
      "cascadeRateValue",
      "cascadeRate",
      0,
      () => {
        nextCaptureAudioTime = audio.currentTime;
      },
      " fps"
    );

    for (const key of [
      "frequencyGraphPlacement",
      "waveformGraphPlacement",
      "levelsGraphPlacement"
    ]) {
      document.getElementById(key).addEventListener("change", (event) => {
        state[key] = event.target.value;
        state.hudLayer = null;
      });
    }

    bindNumber(
      "graphWidth",
      "graphWidthValue",
      "graphWidth",
      0,
      () => { state.hudLayer = null; },
      "%"
    );
    bindNumber(
      "graphHeight",
      "graphHeightValue",
      "graphHeight",
      1,
      () => { state.hudLayer = null; },
      "%"
    );
    bindNumber(
      "metadataX",
      "metadataXValue",
      "metadataX",
      2,
      () => { state.hudLayer = null; },
      "%"
    );
    bindNumber(
      "metadataY",
      "metadataYValue",
      "metadataY",
      2,
      () => { state.hudLayer = null; },
      "%"
    );
    bindNumber(
      "guiTextSize",
      "guiTextSizeValue",
      "guiTextSize",
      2,
      () => { state.hudLayer = null; },
      "%"
    );


    bindCheckbox("hudVisible", "hudVisible", () => {
      state.hudLayer = null;
      updateViewportLogoLayout();
    });

    bindCheckbox("logoVisible", "logoVisible", () => {
      updateViewportLogoLayout();
    });

    bindNumber(
      "logoX",
      "logoXValue",
      "logoX",
      1,
      updateViewportLogoLayout,
      "%"
    );
    bindNumber(
      "logoY",
      "logoYValue",
      "logoY",
      1,
      updateViewportLogoLayout,
      "%"
    );
    bindNumber(
      "logoSize",
      "logoSizeValue",
      "logoSize",
      1,
      updateViewportLogoLayout,
      "%"
    );

    document.getElementById("fftSize").addEventListener("change", async (event) => {
      const requestedFftSize = Number(event.target.value);
      const progressVersion = ++fftProgressVersion;

      state.fftSize = requestedFftSize;

      if (!decodedAudioBuffer) {
        if (analyser) {
          analyser.fftSize = state.fftSize;
          waveformData = new Uint8Array(analyser.fftSize);
          frequencyData = new Uint8Array(
            analyser.frequencyBinCount
          );
        }

        clearHistory();
        hideFftLoadProgress();
        return;
      }

      setFftLoadProgress(5, `Preparing ${state.fftSize} FFT resolution…`);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      if (progressVersion !== fftProgressVersion) {
        return;
      }

      setFftLoadProgress(42, "Reconfiguring audio analyser…");

      if (analyser) {
        analyser.fftSize = state.fftSize;
        waveformData = new Uint8Array(analyser.fftSize);
        frequencyData = new Uint8Array(
          analyser.frequencyBinCount
        );
      }

      await new Promise((resolve) => requestAnimationFrame(resolve));

      if (progressVersion !== fftProgressVersion) {
        return;
      }

      setFftLoadProgress(72, "Refreshing waveform buffers…");
      clearHistory();

      if (state.analysisMode === "frequency") {
        computeOfflineSpectrum(audio.currentTime || 0);
      }

      state.hudLayer = null;
      setFftLoadProgress(78, "Analyzing viewport frequency graph…");
      await rebuildHudFrequencySpectrogram({
        shouldCancel: () => progressVersion !== fftProgressVersion,
        onProgress: (amount) => {
          setFftLoadProgress(
            78 + amount * 21,
            `Analyzing viewport frequency graph · ${Math.round(amount * 100)}%`
          );
        }
      });

      if (progressVersion !== fftProgressVersion) {
        return;
      }

      setFftLoadProgress(100, `${state.fftSize} FFT ready`);
      hideFftLoadProgress(900);
    });

    const rebuildBindings = [
      ["count", "countValue", "count", 0],
      ["historyRows", "historyRowsValue", "historyRows", 0]
    ];

    rebuildBindings.forEach(([inputId, outputId, key, decimals]) => {
      bindNumber(inputId, outputId, key, decimals, () => {
        state.hudLayer = null;
        rebuildWaveform();
        updateLighting();
        resetCamera();
      });
    });

    const matrixBindings = [
      ["size", "sizeValue", "size", 2],
      ["cubeDepth", "cubeDepthValue", "cubeDepth", 2],

      ["gap", "gapValue", "gap", 2],
      ["rowSpacing", "rowSpacingValue", "rowSpacing", 2],
      ["maxHeight", "maxHeightValue", "maxHeight", 1],

      ["minimumHeight", "minimumHeightValue", "minimumHeight", 2],
      ["fadeStart", "fadeStartValue", "fadeStart", 2],
      ["fadeCurve", "fadeCurveValue", "fadeCurve", 2],
      [
        "minimumBrightness",
        "minimumBrightnessValue",
        "minimumBrightness",
        2
      ],
      ["scaleFade", "scaleFadeValue", "scaleFade", 2]
    ];

    matrixBindings.forEach(([inputId, outputId, key, decimals]) => {
      bindNumber(inputId, outputId, key, decimals, () => {
        matrixDirty = true;
        updateLighting();
      });
    });

    bindCheckbox("lightMode", "lightMode", () => {
      applyViewportColorMode(true);
      updateViewportLogoLayout();
      updateMatrices();
    });

    bindCheckbox("amplitudeColor", "amplitudeColor", () => {
      matrixDirty = true;
      updateMatrices();
    });

    document
      .getElementById("amplitudeColormap")
      .addEventListener("change", (event) => {
        state.amplitudeColormap = event.target.value;
        matrixDirty = true;
        updateMatrices();
      });

    bindNumber(
      "colormapSensitivity",
      "colormapSensitivityValue",
      "colormapSensitivity",
      2,
      () => {
        matrixDirty = true;
        updateMatrices();
      }
    );

    bindCheckbox("reverseColormap", "reverseColormap", () => {
      matrixDirty = true;
      updateMatrices();
    });

    bindColor("cubeColor", "cubeColor", () => {
      state.undersideColor = state.cubeColor;
      matrixDirty = true;
      updateMatrices();
      status.textContent = `Waveform color: ${state.cubeColor}`;
    });

    bindColor("peakColor", "peakColor", () => {
      matrixDirty = true;
      state.hudLayer = null;
      updateMatrices();
    });

    bindColor("backgroundColor", "backgroundColor", () => {
      applyViewportColorMode(false);
      updateMatrices();
    });

    document
      .getElementById("materialType")
      .addEventListener("change", (event) => {
        state.materialType = event.target.value;
        updateMaterialControlVisibility();
        rebuildWaveform();
      });

    const materialBindings = [
      ["roughness", "roughnessValue", "roughness", 2],
      ["metalness", "metalnessValue", "metalness", 2],
      ["clearcoat", "clearcoatValue", "clearcoat", 2],
      [
        "clearcoatRoughness",
        "clearcoatRoughnessValue",
        "clearcoatRoughness",
        2
      ],
      ["shininess", "shininessValue", "shininess", 0]
    ];

    materialBindings.forEach(([inputId, outputId, key, decimals]) => {
      bindNumber(
        inputId,
        outputId,
        key,
        decimals,
        updateMaterialProperties
      );
    });

    const lightingBindings = [
      [
        "ambientIntensity",
        "ambientIntensityValue",
        "ambientIntensity",
        2
      ],
      ["keyIntensity", "keyIntensityValue", "keyIntensity", 2],
      ["fillIntensity", "fillIntensityValue", "fillIntensity", 2],
      ["exposure", "exposureValue", "exposure", 2]
    ];

    lightingBindings.forEach(([inputId, outputId, key, decimals]) => {
      bindNumber(inputId, outputId, key, decimals, updateLighting);
    });

    bindNumber(
      "lightAzimuth",
      "lightAzimuthValue",
      "lightAzimuth",
      0,
      updateLighting,
      "°"
    );

    bindNumber(
      "lightElevation",
      "lightElevationValue",
      "lightElevation",
      0,
      updateLighting,
      "°"
    );

    bindCheckbox("shadows", "shadows", updateLighting);

    document
      .getElementById("shadowResolution")
      .addEventListener("change", (event) => {
        state.shadowResolution = Number(event.target.value);
        updateLighting();
      });

    bindColor("keyLightColor", "keyLightColor", updateLighting);
    bindColor("fillLightColor", "fillLightColor", updateLighting);

    bindNumber(
      "pixelRatio",
      "pixelRatioValue",
      "pixelRatio",
      2,
      updateRendererResolution
    );

    bindNumber(
      "cameraHeight",
      "cameraHeightValue",
      "cameraHeight",
      0,
      () => {
        markCameraPresetCustom();
        resetCamera();
      }
    );

    bindNumber(
      "cameraDistance",
      "cameraDistanceValue",
      "cameraDistance",
      0,
      () => {
        markCameraPresetCustom();
        resetCamera();
      }
    );

    bindNumber(
      "cameraZoom",
      "cameraZoomValue",
      "cameraZoom",
      2,
      () => {
        markCameraPresetCustom();
        camera.zoom = state.cameraZoom;
        camera.updateProjectionMatrix();
      },
      "×"
    );

    bindCheckbox("autoRotate", "autoRotate", () => {
      if (state.sinusoidalCameraActive) {
        markCameraPresetCustom();
      }

      controls.autoRotate = state.autoRotate;
      controls.autoRotateSpeed = state.autoRotateSpeed;
    });

    bindNumber(
      "autoRotateSpeed",
      "autoRotateSpeedValue",
      "autoRotateSpeed",
      2,
      () => {
        controls.autoRotateSpeed = state.autoRotateSpeed;
      },
      "×"
    );

    applyCameraPresetButton.addEventListener("click", () => {
      applyCameraPreset();
    });

    cameraPresetInput.addEventListener("change", () => {
      applyCameraPreset();
    });

    document
      .getElementById("applyPerformancePreset")
      .addEventListener("click", applyPerformancePreset);

    document
      .getElementById("importSettings")
      .addEventListener("change", async (event) => {
        const file = event.target.files?.[0];

        if (!file) {
          return;
        }

        try {
          const parsed = JSON.parse(await file.text());
          applySettings(parsed.settings || parsed);
          status.textContent = `Imported settings: ${file.name}`;
        } catch (error) {
          console.error(error);
          status.textContent = `Settings import failed: ${error.message}`;
        }

        event.target.value = "";
      });

    document
      .getElementById("savePreset")
      .addEventListener("click", saveLocalPreset);

    document
      .getElementById("loadPreset")
      .addEventListener("click", loadLocalPreset);

    document
      .getElementById("deletePreset")
      .addEventListener("click", deleteLocalPreset);

    document
      .getElementById("exportButton")
      .addEventListener("click", exportSettings);

    document
      .getElementById("pngButton")
      .addEventListener("click", exportPng);

    exportVideoButton.addEventListener("click", exportVideo);

    videoExportCancel.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestVideoExportCancel();
    });

    orientationInput.addEventListener("change", () => {
      if (orientationInput.value === "square") {
        return;
      }

      state.orientation = orientationInput.value;
      updateExportFormatControls();
      applyHudFormatPreset();
      fitViewport();
    });

    aspectRatioInput.addEventListener("change", () => {
      state.aspectRatio = aspectRatioInput.value;
      updateExportFormatControls();
      applyHudFormatPreset();
      fitViewport();
    });

    bindNumber(
      "viewportSize",
      "viewportSizeValue",
      "viewportSize",
      0,
      fitViewport,
      "%"
    );

    viewportResolutionInput.addEventListener("change", () => {
      state.viewportResolution = viewportResolutionInput.value;
      setVideoExportStatus(
        `Export resolution: ${getViewportResolutionDimensions().width} × ` +
        `${getViewportResolutionDimensions().height}`,
        "idle"
      );
    });

    videoFileTypeInput.addEventListener("change", () => {
      updateVideoExportFormatUi(true);
    });

    videoFrameRateInput.addEventListener("change", () => {
      state.videoFrameRate = Number(videoFrameRateInput.value);
    });

    videoBitrateInput.addEventListener("change", () => {
      state.videoBitrate = Number(videoBitrateInput.value);
    });

    document
      .getElementById("fullscreenButton")
      .addEventListener("click", toggleFullscreen);

    document
      .getElementById("resetButton")
      .addEventListener("click", resetCamera);

    viewport.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, input, select, textarea, a")) {
        return;
      }

      viewport.focus({ preventScroll: true });
    });

    viewport.addEventListener("keydown", (event) => {
      if (event.code !== "Space" || event.repeat) {
        return;
      }

      if (event.target !== viewport || document.getElementById("loop-modal-overlay")) {
        return;
      }

      event.preventDefault();
      togglePlayback();
    });

    sidebarToggle.addEventListener("click", () => {
      const collapsed = app.classList.toggle("sidebar-collapsed");
      sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
      sidebarToggle.setAttribute(
        "aria-label",
        collapsed ? "Expand sidebar" : "Collapse sidebar"
      );
      sidebarToggle.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
      sidebarToggleIcon.textContent = collapsed ? "›" : "‹";

      requestAnimationFrame(resize);
      window.setTimeout(resize, 190);
    });



    function restoreDefaultKeys(keys) {
      for (const key of keys) {
        state[key] = defaults[key];
      }
    }

    function resetSectionSettings(sectionName) {
      const keys = SECTION_DEFAULT_KEYS[sectionName];
      if (!keys) {
        return;
      }

      restoreDefaultKeys(keys);

      if (sectionName === "Audio") {
        audio.playbackRate = state.playbackRate;
        updateOutputAudioLevel();
        if (analyser) {
          analyser.fftSize = state.fftSize;
          waveformData = new Uint8Array(analyser.fftSize);
          frequencyData = new Uint8Array(analyser.frequencyBinCount);
        }
        clearHistory();
        state.hudLayer = null;
        if (decodedAudioBuffer) {
          rebuildHudFrequencySpectrogram().catch((error) => {
            if (error?.name !== "AbortError") console.error(error);
          });
        }
      } else if (sectionName === "Viewport") {
        updateExportFormatControls();
        fitViewport();
      } else if (sectionName === "Viewport HUD") {
        state.hudLayer = null;
        state.hudSpectrumSmoothed = null;
        updateViewportLogoLayout();
      } else if (sectionName === "Waveform Geometry") {
        state.hudLayer = null;
        rebuildWaveform();
        updateLighting();
        resetCamera();
      } else if (sectionName === "Depth Fade") {
        matrixDirty = true;
        updateLighting();
        updateMatrices();
      } else if (sectionName === "Color") {
        state.undersideColor = state.cubeColor;
        applyViewportColorMode(true);
        updateViewportLogoLayout();
        updateMatrices();
      } else if (sectionName === "Material") {
        updateMaterialControlVisibility();
        rebuildWaveform();
      } else if (sectionName === "Lighting") {
        updateLighting();
      } else if (sectionName === "Performance") {
        const performancePreset = document.getElementById("performancePreset");
        if (performancePreset) performancePreset.value = "medium";
        updateRendererResolution();
      } else if (sectionName === "Camera") {
        cameraPresetInput.value = "right";
        applyCameraPreset("right", false);
        controls.autoRotate = state.autoRotate;
        controls.autoRotateSpeed = state.autoRotateSpeed;
      } else if (sectionName === "Export") {
        exportFileNameInput.value = "";
        updateExportFormatControls();
        updateVideoExportFormatUi(false);
      } else if (sectionName === "Presets & Utilities") {
        document.getElementById("presetName").value = "";
        document.getElementById("savedPresets").value = "";
      }

      syncControlsFromState();
      status.textContent = `${sectionName} settings reset.`;
    }

    function initializeSectionResetButtons() {
      document.querySelectorAll(".panel > .section").forEach((section) => {
        const title = section.querySelector(":scope > .section-title");
        if (!title || section.querySelector(":scope > .section-reset-button")) {
          return;
        }

        const sectionName = title.textContent.trim();
        const button = document.createElement("button");
        button.type = "button";
        button.className = "section-reset-button";
        button.textContent = "Reset Settings";
        button.setAttribute("aria-label", `Reset ${sectionName} settings`);
        button.title = `Reset ${sectionName} settings`;
        button.addEventListener("click", () => {
          resetSectionSettings(sectionName);
        });
        section.appendChild(button);
      });
    }

    function initializeCollapsibleSections() {
      document.querySelectorAll(".panel > .section").forEach((section, index) => {
        const title = section.querySelector(":scope > .section-title");

        if (!title) {
          return;
        }

        let content = section.querySelector(":scope > .section-content");
        if (!content) {
          content = document.createElement("div");
          content.className = "section-content";
          [...section.children]
            .filter((child) => child !== title)
            .forEach((child) => content.appendChild(child));
          section.appendChild(content);
        }

        const contentId = `sidebar-section-${index + 1}`;
        const initiallyCollapsed = section.classList.contains("collapsed");
        content.id = contentId;
        content.setAttribute("aria-hidden", initiallyCollapsed ? "true" : "false");
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");
        title.setAttribute("aria-expanded", initiallyCollapsed ? "false" : "true");
        title.setAttribute("aria-controls", contentId);
        section.dataset.sectionId = contentId;

        const setCollapsed = (collapsed) => {
          section.classList.toggle("collapsed", collapsed);
          title.setAttribute("aria-expanded", collapsed ? "false" : "true");
          content.setAttribute("aria-hidden", collapsed ? "true" : "false");
        };

        const toggleSection = () => {
          setCollapsed(!section.classList.contains("collapsed"));
        };

        title.addEventListener("click", toggleSection);

        title.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSection();
          }
        });
      });
    }

    function resize() {
      fitViewport();
    }

    window.addEventListener("resize", resize);

    const viewportResizeObserver = new ResizeObserver(() => {
      if (!isExportingVideo && !isExportingPng) {
        fitViewport();
      }
    });
    viewportResizeObserver.observe(viewport);

    function updateFps(now) {
      fpsFrames++;

      const elapsed = now - fpsLastUpdate;

      if (elapsed >= 500) {
        displayedFps = Math.round((fpsFrames * 1000) / elapsed);
        fpsCounter.textContent = `FPS ${displayedFps}`;

        fpsFrames = 0;
        fpsLastUpdate = now;
      }
    }

    if (window.location.protocol === "file:") {
      status.textContent =
        "For reliable audio and module loading, serve this file through localhost.";
    }

    initializeSectionResetButtons();
    initializeCollapsibleSections();
    audio.playbackRate = state.playbackRate;
    updateOutputAudioLevel();

    syncControlsFromState();
    applyViewportColorMode(true);
    updateViewportLogoLayout();
    updateMaterialControlVisibility();
    updateExportFormatControls();
    updateVideoExportFormatUi(isFirefoxBrowser);
    syncLoopButton();

    refreshSavedPresetList();
    fitViewport();
    rebuildWaveform();
    updateLighting();
    applyCameraPreset("right", false);

    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = state.autoRotateSpeed;

    function animate(now) {
      requestAnimationFrame(animate);

      if (isExportingVideo || isExportingPng) {
        return;
      }

      enforceSelectedLoop();

      if (!isSeeking && audio.src && !audio.paused) {
        syncPlaybackTimeline(audio.currentTime);
      }

      synchronizeCascadeToAudioTime();
      updateSinusoidalCamera(now);
      updateMatrices();
      controls.update();
      renderSceneWithHud();
      updateFps(now);
    }

    requestAnimationFrame(animate);
