// controls.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Control bindings, settings snapshot/apply, local presets, collapsible sections.
import { ALLOWED_COLORMAPS, LOCAL_PRESET_KEY, defaults } from "./config.js";
import { audio, controls, hooks, runtime, state, status } from "./core.js";
import { clamp } from "./utils.js";
import { rebuildHudFrequencySpectrogram } from "./analysis.js";
import { rebuildWaveform, updateLighting } from "./renderer.js";
import { applyViewportColorMode, updateKeyboardControlText, updateViewportLogoLayout } from "./hud.js";
import { fitViewport, resetCamera, updateExportFormatControls, updateRendererResolution } from "./viewport.js";
import { updateOutputAudioLevel } from "./playback.js";

export function updateMaterialControlVisibility() {
  document.querySelectorAll(".material-control").forEach((control) => {
    const supported = control.dataset.materials.split(" ");
    control.hidden = !supported.includes(state.materialType);
  });
}

export function getSettingsSnapshot() {
  return {
    version: 20,
    type: "three-dimensional-mirrored-envelope-sharper-spectrogram",
    settings: Object.fromEntries(
      Object.keys(defaults).map((key) => [key, state[key]])
    )
  };
}

// Preset schema validation: values are checked against the same constraints
// the UI enforces — numeric keys clamp to their input's min/max, string keys
// must match an option of their <select>, colors must be #rrggbb, and
// non-finite numbers (NaN/Infinity survive a typeof check) are rejected.
// Deriving bounds from the DOM keeps this in lockstep with the controls
// without a duplicate hand-written schema.
function sanitizeSettingValue(key, value) {
  const expectedType = typeof defaults[key];

  if (typeof value !== expectedType) {
    return { ok: false };
  }

  if (expectedType === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false };
    }
    const input = document.getElementById(key);

    if (input && input.tagName === "INPUT") {
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      let clampedValue = value;

      if (Number.isFinite(min)) clampedValue = Math.max(min, clampedValue);
      if (Number.isFinite(max)) clampedValue = Math.min(max, clampedValue);
      return { ok: true, value: clampedValue, clamped: clampedValue !== value };
    }
    return { ok: true, value };
  }

  if (expectedType === "string") {
    if (
      key === "orientation" &&
      !["landscape", "portrait"].includes(value)
    ) {
      return { ok: false };
    }

    const select = document.getElementById(key);

    if (
      select &&
      select.tagName === "SELECT" &&
      !Array.from(select.options).some((option) => option.value === value)
    ) {
      return { ok: false };
    }

    if (/Color$/.test(key) && !/^#[0-9a-fA-F]{6}$/.test(value)) {
      return { ok: false };
    }
    return { ok: true, value };
  }

  return { ok: true, value };
}

export function applySettings(settings) {
  if (!settings || typeof settings !== "object") {
    throw new Error("The settings object is invalid.");
  }

  const hasExplicitLightMode =
    Object.prototype.hasOwnProperty.call(settings, "lightMode");
  let rejectedCount = 0;
  let clampedCount = 0;

  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      const result = sanitizeSettingValue(key, settings[key]);

      if (result.ok) {
        state[key] = result.value;
        if (result.clamped) clampedCount++;
      } else {
        rejectedCount++;
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
  hooks.updateVideoExportFormatUi(false);
  fitViewport();
  updateViewportLogoLayout();
  updateKeyboardControlText();
  rebuildWaveform();
  updateLighting();
  resetCamera();

  if (runtime.analyser) {
    runtime.analyser.fftSize = state.fftSize;
    runtime.waveformData = new Uint8Array(runtime.analyser.fftSize);
    runtime.frequencyData = new Uint8Array(
      runtime.analyser.frequencyBinCount
    );
  }

  if (runtime.decodedAudioBuffer) {
    rebuildHudFrequencySpectrogram().catch((error) => {
      if (error?.name !== "AbortError") console.error(error);
    });
  }

  if (rejectedCount > 0 || clampedCount > 0) {
    const parts = [];
    if (rejectedCount > 0) parts.push(`${rejectedCount} invalid value(s) ignored`);
    if (clampedCount > 0) parts.push(`${clampedCount} value(s) clamped to range`);
    status.textContent = `Preset applied — ${parts.join(", ")}.`;
  }
}

export function setOutputValue(id, value, decimals = 2, suffix = "") {
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

export function updateAnalysisModeLabels() {
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

export function syncControlsFromState() {
  const inputIds = Object.keys(defaults);

  for (const id of inputIds) {
    const element = document.getElementById(id);

    if (!element) {
      continue;
    }

    if (id === "orientation" && element.type === "checkbox") {
      element.checked = state.orientation !== "portrait";
    } else if (element.type === "checkbox") {
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

export function bindNumber(
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

export function bindColor(inputId, key, onChange) {
  document.getElementById(inputId).addEventListener("input", (event) => {
    state[key] = event.target.value;
    onChange();
  });
}

export function bindCheckbox(inputId, key, onChange) {
  document.getElementById(inputId).addEventListener("change", (event) => {
    state[key] = event.target.checked;
    onChange();
  });
}

export function readSavedPresets() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PRESET_KEY) || "{}");
  } catch {
    return {};
  }
}

export function writeSavedPresets(presets) {
  localStorage.setItem(LOCAL_PRESET_KEY, JSON.stringify(presets));
}

export function refreshSavedPresetList() {
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

export function saveLocalPreset() {
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

export function loadLocalPreset() {
  const name = document.getElementById("savedPresets").value;
  const preset = readSavedPresets()[name];

  if (!preset?.settings) {
    status.textContent = "Select a saved preset first.";
    return;
  }

  applySettings(preset.settings);
  status.textContent = `Loaded preset: ${name}`;
}

export function deleteLocalPreset() {
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

export function applyPerformancePreset() {
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

  if (runtime.analyser) {
    runtime.analyser.fftSize = state.fftSize;
    runtime.waveformData = new Uint8Array(runtime.analyser.fftSize);
    runtime.frequencyData = new Uint8Array(
      runtime.analyser.frequencyBinCount
    );
  }

  state.hudLayer = null;
  if (runtime.decodedAudioBuffer) {
    rebuildHudFrequencySpectrogram().catch((error) => {
      if (error?.name !== "AbortError") console.error(error);
    });
  }

  status.textContent = `Applied ${preset} quality preset.`;
}

export const rebuildBindings = [
  ["count", "countValue", "count", 0],
  ["historyRows", "historyRowsValue", "historyRows", 0]
];

export const matrixBindings = [
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

export const materialBindings = [
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

export const lightingBindings = [
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

export function initializeCollapsibleSections() {
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

    let contentInner = content.querySelector(":scope > .section-content-inner");
    if (!contentInner) {
      contentInner = document.createElement("div");
      contentInner.className = "section-content-inner";
      while (content.firstChild) {
        contentInner.appendChild(content.firstChild);
      }
      content.appendChild(contentInner);
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

// Register late-bound implementations on the core hooks registry.
hooks.setOutputValue = setOutputValue;
