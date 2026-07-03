// hud.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// HUD overlay drawing: graphs, metadata, logo, static layer, format presets.
import * as THREE from "three";
import { DARK_MODE_HUD_COLOR, DARK_VIEWPORT_BACKGROUND, HUD_FREQUENCY_DB_MAX, HUD_FREQUENCY_DB_MIN, HUD_FREQUENCY_DB_STEP, HUD_FREQUENCY_MAX_HZ, HUD_FREQUENCY_MIN_HZ, LIGHT_MODE_HUD_COLOR, LIGHT_VIEWPORT_BACKGROUND } from "./config.js";
import { audio, camera, hooks, hudCamera, hudCanvas, hudContext, hudDrawingBufferSize, hudMaterial, hudScene, renderer, runtime, scene, state, viewportFrame, viewportLogo } from "./core.js";
import { clamp, hexToHudRgba } from "./utils.js";
import { getHudLevelData, getHudSpectrumData, getHudWaveformData } from "./analysis.js";

const KEYBOARD_CONTROL_TEXT = "LEFT DRAG: ROTATE | RIGHT DRAG: PAN | WHEEL: ZOOM | SPACEBAR: PLAY/PAUSE";

export function updateKeyboardControlText() {
  const controlText = document.getElementById("keyboardControlTextDisplay");

  if (!controlText) {
    return;
  }

  controlText.textContent = KEYBOARD_CONTROL_TEXT;
  controlText.hidden = !state.keyboardControlTextVisible;
  controlText.style.fontSize = `${state.keyboardControlTextFontSize}px`;

  const viewportElement = document.getElementById("viewport");
  const viewportWidth = viewportElement?.clientWidth || window.innerWidth || 0;
  const viewportHeight = viewportElement?.clientHeight || window.innerHeight || 0;
  const xOffset = ((state.keyboardControlTextX - 50) / 100) * viewportWidth;
  const yOffset = ((state.keyboardControlTextY - 96) / 100) * viewportHeight;

  controlText.style.left = `${xOffset}px`;
  controlText.style.top = `${yOffset}px`;
}

export function rebuildHudCanvasTexture() {
  const previousTexture = runtime.hudTexture;
  runtime.hudTexture = new THREE.CanvasTexture(hudCanvas);
  runtime.hudTexture.colorSpace = THREE.SRGBColorSpace;
  runtime.hudTexture.minFilter = THREE.LinearFilter;
  runtime.hudTexture.magFilter = THREE.LinearFilter;
  runtime.hudTexture.generateMipmaps = false;
  hudMaterial.map = runtime.hudTexture;
  hudMaterial.needsUpdate = true;
  previousTexture.dispose();
}

export function getHudColorHex() {
  return state.lightMode
    ? LIGHT_MODE_HUD_COLOR
    : DARK_MODE_HUD_COLOR;
}

export function getHudRgba(alpha = 1) {
  return hexToHudRgba(getHudColorHex(), alpha);
}

export function applyViewportColorMode(forceBackground = true) {
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
  runtime.matrixDirty = true;
}

export function getHudMeasuredOutputLatency() {
  if (!runtime.audioContext || runtime.audioContext.state !== "running") {
    return 0;
  }

  const outputLatency = Number(runtime.audioContext.outputLatency);
  const baseLatency = Number(runtime.audioContext.baseLatency);
  const measuredLatency = Math.max(
    Number.isFinite(outputLatency) ? outputLatency : 0,
    Number.isFinite(baseLatency) ? baseLatency : 0
  );

  return clamp(measuredLatency, 0, 0.25);
}

export function currentHudPlaybackTime() {
  if (Number.isFinite(state.exportPlaybackTimeOverride)) {
    return state.exportPlaybackTimeOverride;
  }

  const rawTime = Number.isFinite(audio.currentTime)
    ? audio.currentTime
    : 0;
  const duration =
    runtime.decodedAudioBuffer?.duration ||
    audio.duration ||
    rawTime;
  const playing =
    Boolean(runtime.decodedAudioBuffer) &&
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

export function truncateHudFileName(fileName, maximumLength) {
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

export function getHudTextMetrics(width, height) {
  const fontSize = Math.max(6, width * (state.guiTextSize / 100));
  return {
    fontSize,
    lineStep: Math.max(fontSize + 2, fontSize * 1.34),
    x: width * (state.metadataX / 100),
    y: height * (state.metadataY / 100)
  };
}

export function getHudGraphLayout(width, height, pad) {
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

export function updateViewportLogoLayout() {
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

export async function prepareExportLogoImage() {
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

export function drawViewportLogoToCanvas(context, width, height) {
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

export function paintHudStaticLayer(context, width, height) {
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
    [1, truncateHudFileName(runtime.loadedAudioFileName, maximumFileLength)],
    [3, `VIEW:${hooks.getViewportFormatName().toUpperCase()}`],
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

export function ensureHudStaticLayer(width, height) {
  const key = [
    width,
    height,
    state.peakColor,
    state.backgroundColor,
    state.orientation,
    state.aspectRatio,
    runtime.loadedAudioFileName,
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
    // OffscreenCanvas avoids DOM-canvas bookkeeping for this purely internal
    // raster surface; drawImage accepts it as a source. DOM canvas fallback
    // keeps older browsers working. (A full worker port was deliberately not
    // done: the video exporter needs the HUD drawn synchronously at exact
    // frame times, which an async worker round-trip would break.)
    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(Math.max(1, width), Math.max(1, height))
      : document.createElement("canvas");
    layer = { canvas, key: "" };
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

export function drawHudLevelsGraph(
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

export function drawViewportHud() {
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
  const staticLayer = ensureHudStaticLayer(width, height);

  // Repaint skip: while paused (and not exporting), the HUD is fully
  // determined by this key. If it matches the last painted frame, the
  // existing texture already shows the correct pixels — skip the 2D repaint
  // and GPU re-upload entirely.
  const exporting =
    runtime.isExportingVideo ||
    runtime.isExportingPng ||
    Number.isFinite(state.exportPlaybackTimeOverride);
  const paused = !audio.src || audio.paused;

  if (!exporting && paused) {
    const dynamicKey = [
      width,
      height,
      staticLayer.key,
      getHudColorHex(),
      state.hudVisible ? 1 : 0,
      runtime.decodedAudioBuffer ? 1 : 0,
      currentHudPlaybackTime().toFixed(3)
    ].join("|");

    if (runtime.hudLastDynamicKey === dynamicKey) {
      return;
    }
    runtime.hudLastDynamicKey = dynamicKey;
  } else {
    runtime.hudLastDynamicKey = null;
  }

  hudContext.clearRect(0, 0, width, height);
  hudContext.drawImage(staticLayer.canvas, 0, 0);

  const line = getHudRgba(0.90);
  const metrics = getHudTextMetrics(width, height);
  hudContext.fillStyle = line;
  hudContext.strokeStyle = line;
  hudContext.font = `${metrics.fontSize}px "Cozette", "CozetteVector", monospace`;
  hudContext.textBaseline = "top";

  const mode = !runtime.decodedAudioBuffer
    ? "IDLE"
    : Number.isFinite(state.exportPlaybackTimeOverride) || !audio.paused
      ? "PLAYING"
      : "PAUSED";
  const frameRate = state.exportFrameRateOverride ?? runtime.displayedFps;
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

  if (runtime.isExportingVideo || runtime.isExportingPng) {
    drawViewportLogoToCanvas(hudContext, width, height);
  }

  runtime.hudTexture.needsUpdate = true;
}

export function renderSceneWithHud() {
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

export function getHudFormatPreset() {
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

export function applyHudFormatPreset() {
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
  hooks.setOutputValue("graphWidthValue", state.graphWidth, 0, "%");
  hooks.setOutputValue("graphHeightValue", state.graphHeight, 1, "%");
  hooks.setOutputValue("metadataXValue", state.metadataX, 2, "%");
  hooks.setOutputValue("metadataYValue", state.metadataY, 2, "%");
  hooks.setOutputValue("guiTextSizeValue", state.guiTextSize, 2, "%");
  hooks.setOutputValue("logoXValue", state.logoX, 1, "%");
  hooks.setOutputValue("logoYValue", state.logoY, 1, "%");
  hooks.setOutputValue("logoSizeValue", state.logoSize, 1, "%");
  const logoVisibleControl = document.getElementById("logoVisible");
  if (logoVisibleControl) {
    logoVisibleControl.checked = state.logoVisible;
  }
  state.hudLayer = null;
  updateViewportLogoLayout();
}

// Register late-bound implementations on the core hooks registry.
hooks.currentHudPlaybackTime = currentHudPlaybackTime;
