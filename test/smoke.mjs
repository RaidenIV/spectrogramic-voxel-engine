// Smoke test: boots the real module graph against the real index.html in a
// headless DOM (jsdom), with WebGL and 2D canvas stubbed. Catches module
// evaluation errors, broken event wiring, and regressions in the robustness
// features — at zero browser cost. Run with: npm test
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';

const ROOT = new URL('..', import.meta.url);
const html = readFileSync(new URL('index.html', ROOT), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8000/', pretendToBeVisual: true });
const { window } = dom;

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

// ---- mock 2D canvas context ------------------------------------------------
function makeCtx2d(canvas) {
  const gradient = { addColorStop() {} };
  const target = {
    canvas,
    measureText: t => ({ width: (t ? String(t).length : 0) * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    isPointInPath: () => false
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === 'string') { t[p] = () => undefined; return t[p]; }
      return undefined;
    },
    set(t, p, v) { t[p] = v; return true; }
  });
}
const ctxCache = new WeakMap();
window.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (!ctxCache.has(this)) ctxCache.set(this, {});
  const c = ctxCache.get(this);
  if (!c[kind]) c[kind] = kind === '2d' ? makeCtx2d(this) : {};
  return c[kind];
};

// ---- globals -----------------------------------------------------------------
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
const g = globalThis;
g.window = window;
g.document = window.document;
Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true });
for (const k of ['HTMLElement', 'HTMLCanvasElement', 'HTMLInputElement', 'HTMLSelectElement', 'Audio',
  'Image', 'Event', 'CustomEvent', 'PointerEvent', 'KeyboardEvent', 'MouseEvent', 'Blob', 'File',
  'FileReader', 'URL', 'localStorage', 'DOMParser', 'XMLSerializer', 'Node', 'devicePixelRatio', 'screen'
]) {
  if (window[k] !== undefined && g[k] === undefined) { try { g[k] = window[k]; } catch {} }
}
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.ResizeObserver = window.ResizeObserver = ResizeObserverStub;
g.matchMedia = window.matchMedia = window.matchMedia || (q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
g.AudioContext = window.AudioContext = window.AudioContext || class {
  constructor() { this.destination = {}; this.currentTime = 0; this.state = 'suspended'; }
  createAnalyser() { return { connect() {}, disconnect() {}, fftSize: 2048, frequencyBinCount: 1024, getByteFrequencyData() {}, getByteTimeDomainData() {}, smoothingTimeConstant: 0 }; }
  createGain() { return { gain: { value: 1, setValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createMediaElementSource() { return { connect() {}, disconnect() {} }; }
  resume() { return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve(null); }
  get baseLatency() { return 0; }
  get outputLatency() { return 0; }
};
if (!g.AudioBuffer) g.AudioBuffer = class {
  constructor({ length = 1, numberOfChannels = 1, sampleRate = 48000 } = {}) {
    this.length = length; this.numberOfChannels = numberOfChannels; this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._d = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(i) { return this._d[i]; }
};
window.document.fonts = window.document.fonts || { load: () => Promise.resolve([]), ready: Promise.resolve(), check: () => true, add() {} };
g.location = window.location;

let windowErrors = 0;
window.addEventListener('error', e => { windowErrors++; console.error('WINDOW ERROR:', e.error?.stack || e.message); });
process.on('unhandledRejection', e => { windowErrors++; console.error('UNHANDLED REJECTION:', e?.stack || e); });

// ---- boot --------------------------------------------------------------------
try {
  await import(new URL('assets/js/app.js', ROOT));
  check('module graph evaluates and app boots', true);
} catch (e) {
  console.error(e.stack || e);
  check('module graph evaluates and app boots', false);
  process.exit(1);
}

await new Promise(r => setTimeout(r, 250));
check('render loop survives initial frames', windowErrors === 0);
check('default colormap is grayscale', document.getElementById('amplitudeColormap')?.value === 'grayscale');

// ---- UI wiring sweep -----------------------------------------------------------
const fire = (id, type) => document.getElementById(id).dispatchEvent(new window.Event(type, { bubbles: true }));
const click = id => document.getElementById(id).click();
try {
  const sel = document.getElementById('amplitudeColormap');
  sel.value = 'viridis'; fire('amplitudeColormap', 'change');
  sel.value = 'grayscale'; fire('amplitudeColormap', 'change');
  document.getElementById('sensitivity').value = '2'; fire('sensitivity', 'input');
  fire('lightMode', 'change'); fire('lightMode', 'change');
  click('clearButton'); click('resetButton');
  click('sidebarToggle'); click('sidebarToggle');
  fire('orientation', 'change'); fire('viewportResolution', 'change');
  click('fullscreenButton');
  check('UI interaction sweep', true);
} catch (e) {
  console.error(e.stack || e);
  check('UI interaction sweep', false);
}

// ---- robustness probes ----------------------------------------------------------
// WebCodecs detection: jsdom has no VideoEncoder, so the export button must be disabled.
check('video export disabled without WebCodecs',
  document.getElementById('exportVideo')?.disabled === true ||
  document.querySelector('#exportVideoButton, [id*="exportVideo"]')?.disabled === true);

// Preset validation: NaN, out-of-range, and unknown-enum values must not reach state.
const { applySettings } = await import(new URL('assets/js/controls.js', ROOT));
const { state } = await import(new URL('assets/js/core.js', ROOT));
const before = { sensitivity: state.sensitivity, materialType: state.materialType };
applySettings({ sensitivity: Number.NaN, materialType: 'not-a-material', cubeColor: 'javascript:alert(1)' });
check('preset validation rejects NaN', Number.isFinite(state.sensitivity) && state.sensitivity === before.sensitivity);
check('preset validation rejects unknown enum', state.materialType === before.materialType);
check('preset validation rejects malformed color', /^#[0-9a-fA-F]{6}$/.test(state.cubeColor));

// Context loss/restore handlers must not throw.
const { renderer } = await import(new URL('assets/js/core.js', ROOT));
try {
  renderer.domElement.dispatchEvent(new window.Event('webglcontextlost', { cancelable: true }));
  renderer.domElement.dispatchEvent(new window.Event('webglcontextrestored'));
  check('context loss/restore handlers run clean', true);
} catch (e) {
  console.error(e.stack || e);
  check('context loss/restore handlers run clean', false);
}

// Error surface: an uncaught error must appear in the status bar.
window.dispatchEvent(Object.assign(new window.Event('error'), { error: new Error('smoke-test synthetic failure') }));
await new Promise(r => setTimeout(r, 50));
check('uncaught errors surface in status bar',
  (document.getElementById('status')?.textContent || '').includes('smoke-test synthetic failure'));


// Audio loading progress stays inside the fixed-height file button and prevents
// additional file selection until the visible loading state has cleared.
{
  const { setAudioLoadProgress, hideAudioLoadProgress } = await import(new URL('assets/js/loader.js', ROOT));
  const fileInput = document.getElementById('audioFile');
  const fileButton = document.getElementById('audioFileButton');
  const fileButtonText = document.getElementById('audioFileButtonText');
  const progressWrap = document.getElementById('audioLoadProgressWrap');
  const progress = document.getElementById('audioLoadProgress');

  setAudioLoadProgress(42, 'Reading audio file…');
  check('audio loading progress replaces the load button text',
    fileButtonText?.hidden === true && progressWrap?.hidden === false && progress?.value === 42);
  check('audio load button is unusable while progress is visible',
    fileInput?.disabled === true && fileButton?.classList.contains('is-loading') &&
    fileButton?.getAttribute('aria-disabled') === 'true');

  hideAudioLoadProgress();
  check('audio load button is restored after loading progress clears',
    fileInput?.disabled === false && fileButtonText?.hidden === false && progressWrap?.hidden === true &&
    !fileButton?.classList.contains('is-loading'));
}

// Cascade rows must populate the existing blank grid in place. Unfilled rows
// remain visible as zero-amplitude placeholders instead of being hidden and
// recreated as history grows.
{
  const { commitSampledRow } = await import(new URL('assets/js/analysis.js', ROOT));
  const { clearHistory, updateMatrices } = await import(new URL('assets/js/renderer.js', ROOT));
  const { runtime, state } = await import(new URL('assets/js/core.js', ROOT));

  clearHistory(true);
  const placeholderMesh = runtime.upperRowMeshes[1];
  commitSampledRow(new Float32Array(state.count).fill(0.5));
  updateMatrices();

  const placeholderMatrix = new Float32Array(16);
  placeholderMesh.getMatrixAt(0, {
    elements: placeholderMatrix,
    fromArray(array, offset = 0) {
      placeholderMatrix.set(array.subarray(offset, offset + 16));
      return this;
    }
  });

  check('cascade reuses the existing blank row meshes',
    runtime.upperRowMeshes[1] === placeholderMesh);
  check('unfilled cascade rows remain visible as blank placeholders',
    Math.abs(placeholderMatrix[0]) > 0.001 &&
    Math.abs(placeholderMatrix[5]) > 0.001 &&
    Math.abs(placeholderMatrix[10]) > 0.001);
}

// Sidebar logo (SIDEBAR.md section 14): bottom-anchored flex footer, single
// canonical CSS rule, stable scrollbar gutter, correct SVG attribute casing.
{
  const { readFileSync: rf } = await import('fs');
  const css = rf(new URL('assets/css/main.css', ROOT), 'utf8');
  const logoRuleCount = (css.match(/\.sidebar-logo \{/g) || []).length;
  check('exactly one .sidebar-logo rule', logoRuleCount === 1);
  const logoRule = css.split('.sidebar-logo {')[1].split('}')[0];
  check('logo bottom-anchored via margin: auto auto 6px', logoRule.includes('margin: auto auto 6px'));
  check('global panel scrollbar gutter under animation comment',
    css.includes('/* Stable sidebar width and animated section expansion. */\n.panel {\n  scrollbar-gutter: stable;\n}'));
  check('embedded audio progress uses a green fill without external spacing',
    css.includes('.audio-file-load-progress-wrap {\n  width: 100%;\n  margin-top: 0;') &&
    css.includes('.audio-file-load-progress-wrap .audio-load-progress::-webkit-progress-value {\n  background: #22c55e;'));
  check('section expansion animation keeps titles outside the animated track',
    css.includes('.panel > .section {\n  display: block;\n}') &&
    css.includes('.panel > .section > .section-content {') &&
    css.includes('grid-template-rows: minmax(0, 0fr);') &&
    css.includes('.section-content > .section-content-inner'));
  const firstSection = document.querySelector('.panel > .section');
  const firstSectionTitle = firstSection?.querySelector(':scope > .section-title');
  const firstSectionContent = firstSection?.querySelector(':scope > .section-content');
  check('section content uses a dedicated animation wrapper',
    firstSectionTitle &&
    firstSectionContent?.querySelector(':scope > .section-content-inner') &&
    firstSectionTitle.parentElement === firstSection &&
    firstSectionContent.parentElement === firstSection);
  const logoWrap = document.querySelector('.sidebar-logo');
  const panel = document.getElementById('controlPanel');
  check('logo is the last element in the sidebar panel', panel && panel.lastElementChild === logoWrap);
  const logoSvg = document.querySelector('.sidebar-logo-svg');
  check('logo SVG has viewBox and preserveAspectRatio',
    logoSvg?.getAttribute('viewBox') === '0 0 1280 446' &&
    logoSvg?.getAttribute('preserveAspectRatio') === 'xMidYMid meet');
  check('logo SVG hidden from assistive technology', logoSvg?.getAttribute('aria-hidden') === 'true');
}

await new Promise(r => setTimeout(r, 100));
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
