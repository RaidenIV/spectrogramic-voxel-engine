// Test-only stand-in for THREE's WebGLRenderer (no GPU in the test runner).
// Everything else re-exports the real three build.
export * from 'three';
import * as REAL from 'three';

export class WebGLRenderer {
  constructor(params = {}) {
    this.domElement = params.canvas || globalThis.document.createElement('canvas');
    this.shadowMap = { enabled: false, type: 0 };
    this.capabilities = { getMaxAnisotropy: () => 1, isWebGL2: true, maxTextureSize: 8192 };
    this.info = { render: {}, memory: {} };
    this._pixelRatio = 1;
    this._size = new REAL.Vector2(1, 1);
    this.outputColorSpace = REAL.SRGBColorSpace;
    this.toneMapping = 0;
    this.toneMappingExposure = 1;
  }
  setPixelRatio(v) { this._pixelRatio = v; }
  getPixelRatio() { return this._pixelRatio; }
  setSize(w, h) { this._size.set(w, h); this.domElement.width = w; this.domElement.height = h; }
  getSize(t) { return t ? t.copy(this._size) : this._size.clone(); }
  getDrawingBufferSize(t) { const w = this._size.x * this._pixelRatio, h = this._size.y * this._pixelRatio; return t ? t.set(w, h) : { x: w, y: h }; }
  setViewport() {} setScissor() {} setScissorTest() {}
  setClearColor() {} setClearAlpha() {} getClearColor(t) { return t; } getClearAlpha() { return 1; }
  render() {} clear() {} clearDepth() {} dispose() {}
  getContext() { return {}; }
  setRenderTarget() {} getRenderTarget() { return null; }
  readRenderTargetPixels() {} resetState() {} compile() {} forceContextLoss() {}
}
