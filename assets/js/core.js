// core.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Shared state, DOM element handles, THREE.js scene setup, and runtime state.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { defaults } from "./config.js";

// Shared mutable runtime state. Modules read and write these fields through
// the single `runtime` object so the split preserves the monolith's behavior.
export const runtime = {};

export const viewport = document.getElementById("viewport");

export const viewportFrame = document.getElementById("viewportFrame");

export const viewportLogo = document.getElementById("viewportLogo");

export const status = document.getElementById("status");

export const fpsCounter = document.getElementById("fpsCounter");

export const audioFileInput = document.getElementById("audioFile");

export const audioLoadProgressWrap =
  document.getElementById("audioLoadProgressWrap");

export const audioLoadProgress = document.getElementById("audioLoadProgress");

export const audioLoadProgressText =
  document.getElementById("audioLoadProgressText");

export const audioLoadStage = document.getElementById("audioLoadStage");

export const fftLoadProgressWrap =
  document.getElementById("fftLoadProgressWrap");

export const fftLoadProgress = document.getElementById("fftLoadProgress");

export const fftLoadProgressText =
  document.getElementById("fftLoadProgressText");

export const fftLoadStage = document.getElementById("fftLoadStage");

export const playButton = document.getElementById("playButton");

export const clearButton = document.getElementById("clearButton");

export const timeline = document.getElementById("timeline");

export const currentTimeLabel = document.getElementById("currentTime");

export const durationLabel = document.getElementById("duration");

export const loopButton = document.getElementById("loopButton");

export const loopStatus = document.getElementById("loopStatus");

export const cameraPresetInput = document.getElementById("cameraPreset");

export const applyCameraPresetButton = document.getElementById("applyCameraPreset");

export const app = document.getElementById("app");

export const sidebarToggle = document.getElementById("sidebarToggle");

export const sidebarToggleIcon = document.getElementById("sidebarToggleIcon");

export const orientationInput = document.getElementById("orientation");

export const aspectRatioInput = document.getElementById("aspectRatio");

export const viewportSizeInput = document.getElementById("viewportSize");

export const viewportResolutionInput =
  document.getElementById("viewportResolution");

export const exportFileNameInput = document.getElementById("exportFileName");

export const videoFileTypeInput = document.getElementById("videoFileType");

export const videoFrameRateInput = document.getElementById("videoFrameRate");

export const videoBitrateInput = document.getElementById("videoBitrate");

export const exportVideoButton = document.getElementById("exportVideoButton");

export const videoExportStatus = document.getElementById("videoExportStatus");

export const videoExportProgress = document.getElementById("videoExportProgress");

export const videoExportOverlay = document.getElementById("videoExportOverlay");

export const videoExportOverlayStatus =
  document.getElementById("videoExportOverlayStatus");

export const videoExportOverlayProgress =
  document.getElementById("videoExportOverlayProgress");

export const videoExportCancel = document.getElementById("videoExportCancel");

export const scene = new THREE.Scene();

scene.background = new THREE.Color("#000000");

export const camera = new THREE.PerspectiveCamera(
  50,
  16 / 9,
  0.1,
  1000
);

export const renderer = new THREE.WebGLRenderer({
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

export const hudCanvas = document.createElement("canvas");

export const hudContext = hudCanvas.getContext("2d", { alpha: true });

runtime.hudTexture = new THREE.CanvasTexture(hudCanvas);

runtime.hudTexture.colorSpace = THREE.SRGBColorSpace;

runtime.hudTexture.minFilter = THREE.LinearFilter;

runtime.hudTexture.magFilter = THREE.LinearFilter;

runtime.hudTexture.generateMipmaps = false;

export const hudScene = new THREE.Scene();

export const hudCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);

hudCamera.position.z = 1;

export const hudMaterial = new THREE.MeshBasicMaterial({
  map: runtime.hudTexture,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  toneMapped: false
});

export const hudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hudMaterial);

hudQuad.frustumCulled = false;

hudScene.add(hudQuad);

export const hudDrawingBufferSize = new THREE.Vector2();

export const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;

controls.dampingFactor = 0.07;

controls.enablePan = true;

controls.enableZoom = true;

controls.enableRotate = true;

controls.screenSpacePanning = true;

controls.minDistance = 3;

controls.maxDistance = 520;

controls.target.set(0, 0, -30);

export const ambientLight = new THREE.HemisphereLight(
  0xdde8ff,
  0x211b18,
  1.2
);

scene.add(ambientLight);

export const keyLight = new THREE.DirectionalLight(0xfff4e8, 4);

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

export const fillLight = new THREE.DirectionalLight(0xb8d4ff, 1.5);

fillLight.position.set(-45, 28, 25);

scene.add(fillLight);

export const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);

rimLight.position.set(0, 20, -100);

scene.add(rimLight);

export const state = { ...defaults };

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

export const waveformGroup = new THREE.Group();

scene.add(waveformGroup);

runtime.waveformGeometry = null;

runtime.upperRowMeshes = [];

runtime.undersideRowMeshes = [];

runtime.historyData = new Float32Array(state.count * state.historyRows);

runtime.historyHead = 0;

runtime.historyCount = 0;

runtime.forceBlankHistoryGrid = false;

runtime.smoothedSamples = new Float32Array(state.count);

runtime.matrixDirty = true;

export const dummy = new THREE.Object3D();

export const temporaryUpperColor = new THREE.Color();

export const temporaryUndersideColor = new THREE.Color();

export const temporaryPeakColor = new THREE.Color();

export const temporaryBackgroundColor = new THREE.Color();

export const temporaryColormapColor = new THREE.Color();

export const colormapColorA = new THREE.Color();

export const colormapColorB = new THREE.Color();

export const audio = new Audio();

audio.preload = "metadata";

runtime.audioContext = null;

runtime.analyser = null;

runtime.sourceNode = null;

runtime.outputGainNode = null;

runtime.waveformData = null;

runtime.frequencyData = null;

runtime.currentObjectUrl = null;

runtime.decodedAudioBuffer = null;

runtime.loadedAudioFileName = "";

runtime.nextCaptureAudioTime = 0;

runtime.isSeeking = false;

runtime.loopWrapPending = false;

runtime.loopWaveformPeaks = null;

runtime.loopBpmDetectionVersion = 0;

runtime.audioLoadVersion = 0;

runtime.audioReady = false;

runtime.audioLoadProgressHideTimer = 0;

runtime.fftLoadProgressHideTimer = 0;

runtime.fftProgressVersion = 0;

runtime.isExportingPng = false;

runtime.isExportingVideo = false;

runtime.videoExportCancelled = false;

runtime.Mp4MuxerModule = null;

runtime.MediabunnyModule = null;

runtime.fpsFrames = 0;

runtime.fpsLastUpdate = performance.now();

runtime.displayedFps = 0;

runtime.sinusoidalCameraStartTime = 0;
