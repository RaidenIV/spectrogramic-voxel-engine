// reset.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Reset-to-defaults for each control section.
import { DEFAULT_CAMERA_PRESET, defaults } from "./config.js";
import { audio, cameraPresetInput, controls, exportFileNameInput, runtime, state, status } from "./core.js";
import { rebuildHudFrequencySpectrogram } from "./analysis.js";
import { clearHistory, rebuildWaveform, updateLighting, updateMatrices } from "./renderer.js";
import { applyViewportColorMode, updateKeyboardControlText, updateViewportLogoLayout } from "./hud.js";
import { applyCameraPreset, fitViewport, resetCamera, updateExportFormatControls, updateRendererResolution } from "./viewport.js";
import { updateOutputAudioLevel } from "./playback.js";
import { syncControlsFromState, updateMaterialControlVisibility } from "./controls.js";
import { updateVideoExportFormatUi } from "./export.js";

export const SECTION_DEFAULT_KEYS = Object.freeze({
  Audio: [
    "playbackRate", "volume", "muted", "fftSize", "sensitivity",
    "attack", "release", "spatialSmoothing", "historyBlend",
    "cascadeRate"
  ],
  DISPLAY: ["orientation", "aspectRatio", "viewportSize"],
  HUD: [
    "hudVisible", "keyboardControlTextVisible", "keyboardControlText",
    "keyboardControlTextFontSize", "keyboardControlTextX",
    "keyboardControlTextY", "logoVisible", "logoX", "logoY", "logoSize",
    "frequencyGraphPlacement", "waveformGraphPlacement",
    "levelsGraphPlacement", "graphWidth", "graphHeight",
    "metadataX", "metadataY", "guiTextSize"
  ],
  "Waveform Geometry": [
    "count", "historyRows", "size", "cubeDepth", "gap",
    "rowSpacing", "maxHeight", "minimumHeight"
  ],
  "Depth Fade": [
    "fadeStart", "fadeCurve", "minimumBrightness", "scaleFade"
  ],
  Color: [
    "lightMode", "amplitudeColor", "amplitudeColormap",
    "colormapSensitivity", "reverseColormap", "cubeColor",
    "undersideColor", "peakColor", "backgroundColor"
  ],
  Material: [
    "materialType", "roughness", "metalness", "clearcoat",
    "clearcoatRoughness", "shininess"
  ],
  Lighting: [
    "ambientIntensity", "keyIntensity", "fillIntensity",
    "lightAzimuth", "lightElevation", "exposure", "shadows",
    "shadowResolution", "keyLightColor", "fillLightColor"
  ],
  Performance: ["pixelRatio"],
  Camera: [
    "cameraHeight", "cameraDistance", "cameraZoom", "autoRotate",
    "autoRotateSpeed", "sinusoidalCameraActive"
  ],
  Export: [
    "viewportResolution", "videoFileType", "videoFrameRate",
    "videoBitrate"
  ],
  PRESETS: []
});

export function restoreDefaultKeys(keys) {
  for (const key of keys) {
    state[key] = defaults[key];
  }
}

export function resetSectionSettings(sectionName) {
  const keys = SECTION_DEFAULT_KEYS[sectionName];
  if (!keys) {
    return;
  }

  restoreDefaultKeys(keys);

  if (sectionName === "Audio") {
    audio.playbackRate = state.playbackRate;
    updateOutputAudioLevel();
    if (runtime.analyser) {
      runtime.analyser.fftSize = state.fftSize;
      runtime.waveformData = new Uint8Array(runtime.analyser.fftSize);
      runtime.frequencyData = new Uint8Array(runtime.analyser.frequencyBinCount);
    }
    clearHistory();
    state.hudLayer = null;
    if (runtime.decodedAudioBuffer) {
      rebuildHudFrequencySpectrogram().catch((error) => {
        if (error?.name !== "AbortError") console.error(error);
      });
    }
  } else if (sectionName === "DISPLAY") {
    updateExportFormatControls();
    fitViewport();
  } else if (sectionName === "HUD") {
    state.hudLayer = null;
    state.hudSpectrumSmoothed = null;
    updateViewportLogoLayout();
    updateKeyboardControlText();
  } else if (sectionName === "Waveform Geometry") {
    state.hudLayer = null;
    rebuildWaveform();
    updateLighting();
    resetCamera();
  } else if (sectionName === "Depth Fade") {
    runtime.matrixDirty = true;
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
    cameraPresetInput.value = DEFAULT_CAMERA_PRESET;
    applyCameraPreset(DEFAULT_CAMERA_PRESET, false);
    controls.autoRotate = state.autoRotate;
    controls.autoRotateSpeed = state.autoRotateSpeed;
  } else if (sectionName === "Export") {
    exportFileNameInput.value = "";
    updateExportFormatControls();
    updateVideoExportFormatUi(false);
  } else if (sectionName === "PRESETS") {
    document.getElementById("presetName").value = "";
    document.getElementById("savedPresets").value = "";
  }

  syncControlsFromState();
  status.textContent = `${sectionName} settings reset.`;
}

export function initializeSectionResetButtons() {
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
