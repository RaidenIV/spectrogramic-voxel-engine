// viewport.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Viewport sizing, resolution presets, camera presets, fullscreen, resize.
import * as THREE from "three";
import { BASELINE_CAMERA_VERTICAL_FOV, BASELINE_VIEWPORT_ASPECT, CAMERA_PRESETS, DEFAULT_CAMERA_PRESET, PREVIEW_MAX_RENDER_SCALE, PREVIEW_MIN_RENDER_SCALE, defaults } from "./config.js";
import { aspectRatioInput, camera, cameraPresetInput, controls, hooks, orientationInput, renderer, runtime, state, status, viewport, viewportFrame, viewportSizeInput } from "./core.js";
import { clamp } from "./utils.js";
import { getHistoryDepthCenter } from "./renderer.js";
import { applyHudFormatPreset, updateKeyboardControlText, updateViewportLogoLayout } from "./hud.js";

export function getViewportFormatName() {
  if (state.aspectRatio === "square") {
    return "square";
  }

  return state.orientation === "portrait"
    ? "portrait"
    : "landscape";
}

export function applyViewportCameraProjection(renderTarget) {
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

export function getWebpageRenderDimensions() {
  const format = getViewportFormatName();

  if (format === "square") {
    return { width: 1080, height: 1080 };
  }

  return format === "portrait"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

export function getViewportResolutionDimensions() {
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

export function updateExportFormatControls() {
  const isSquare = state.aspectRatio === "square";
  const orientationLabel = document.getElementById("orientationLabel");
  const widescreenOption =
    aspectRatioInput.querySelector('option[value="widescreen"]');
  const isLandscape = state.orientation !== "portrait";
  const orientationName = isLandscape ? "Landscape" : "Portrait";

  if (widescreenOption) {
    widescreenOption.textContent = isLandscape
      ? "Landscape — 16:9"
      : "Portrait — 9:16";
  }

  orientationInput.checked = isLandscape;
  orientationInput.disabled = isSquare;
  orientationInput.setAttribute("aria-disabled", String(isSquare));
  orientationInput.setAttribute("aria-checked", String(isLandscape));
  orientationInput.setAttribute(
    "aria-label",
    isSquare ? "Square orientation" : `${orientationName} orientation`
  );
  orientationInput.title = isSquare
    ? "Square — 1:1. Orientation does not apply."
    : `${orientationName} viewport orientation.`;

  if (orientationLabel) {
    orientationLabel.textContent = isSquare ? "Square" : orientationName;
  }

  aspectRatioInput.title = isSquare
    ? "Square — 1:1 viewport aspect ratio."
    : isLandscape
      ? "Landscape — 16:9 viewport aspect ratio."
      : "Portrait — 9:16 viewport aspect ratio.";
}

export function updateRendererResolution() {
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

export function fitViewport() {
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

export function resetViewToDefaults() {
  Object.assign(state, {
    orientation: defaults.orientation,
    aspectRatio: defaults.aspectRatio,
    viewportSize: defaults.viewportSize,
    cameraHeight: defaults.cameraHeight,
    cameraDistance: defaults.cameraDistance,
    cameraZoom: defaults.cameraZoom,
    autoRotate: defaults.autoRotate,
    autoRotateSpeed: defaults.autoRotateSpeed,
    sinusoidalCameraActive: defaults.sinusoidalCameraActive
  });

  viewportSizeInput.value = String(state.viewportSize);
  hooks.setOutputValue("viewportSizeValue", state.viewportSize, 0, "%");

  const cameraZoomInput = document.getElementById("cameraZoom");
  const autoRotateInput = document.getElementById("autoRotate");
  const autoRotateSpeedInput = document.getElementById("autoRotateSpeed");

  if (cameraZoomInput) cameraZoomInput.value = String(state.cameraZoom);
  if (autoRotateInput) autoRotateInput.checked = state.autoRotate;
  if (autoRotateSpeedInput) {
    autoRotateSpeedInput.value = String(state.autoRotateSpeed);
  }

  hooks.setOutputValue("cameraZoomValue", state.cameraZoom, 2, "×");
  hooks.setOutputValue(
    "autoRotateSpeedValue",
    state.autoRotateSpeed,
    2,
    "×"
  );

  cameraPresetInput.value = DEFAULT_CAMERA_PRESET;
  controls.autoRotate = state.autoRotate;
  controls.autoRotateSpeed = state.autoRotateSpeed;

  updateExportFormatControls();
  applyHudFormatPreset();
  fitViewport();
  applyCameraPreset(DEFAULT_CAMERA_PRESET, false);
  status.textContent = "View reset to default camera and display settings.";
}

export function resetCamera() {
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

export function positionSinusoidalCamera(elapsedSeconds) {
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

export function updateSinusoidalCamera(now) {
  if (!state.sinusoidalCameraActive) {
    return;
  }

  if (!runtime.sinusoidalCameraStartTime) {
    runtime.sinusoidalCameraStartTime = now;
  }

  positionSinusoidalCamera((now - runtime.sinusoidalCameraStartTime) / 1000);
}

export function markCameraPresetCustom() {
  state.sinusoidalCameraActive = false;
  runtime.sinusoidalCameraStartTime = 0;
  controls.autoRotate = state.autoRotate;

  if (cameraPresetInput) {
    cameraPresetInput.value = "custom";
  }
}

export function applyCameraPreset(
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
  runtime.sinusoidalCameraStartTime = state.sinusoidalCameraActive
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

  hooks.setOutputValue("cameraHeightValue", y, 0);
  hooks.setOutputValue("cameraDistanceValue", Math.abs(z), 0);
  camera.zoom = state.cameraZoom;
  camera.updateProjectionMatrix();
  controls.update();

  if (announce) {
    status.textContent = `Camera preset: ${cameraPresetInput.options[cameraPresetInput.selectedIndex].text}`;
  }
}

export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    viewport.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

export function resize() {
  fitViewport();
  updateKeyboardControlText();
}

export const viewportResizeObserver = new ResizeObserver(() => {
  if (!runtime.isExportingVideo && !runtime.isExportingPng) {
    fitViewport();
    updateKeyboardControlText();
  }
});

// Register late-bound implementations on the core hooks registry.
hooks.getViewportFormatName = getViewportFormatName;
