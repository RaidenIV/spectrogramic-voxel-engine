// app.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Entry point: wires events and boots the app.
import { app, applyCameraPresetButton, aspectRatioInput, audio, audioFileInput, camera, cameraPresetInput, clearButton, controls, exportVideoButton, loopButton, orientationInput, playButton, runtime, sidebarToggle, sidebarToggleIcon, state, status, timeline, videoBitrateInput, videoExportCancel, videoFileTypeInput, videoFrameRateInput, viewport, viewportResolutionInput } from "./core.js";
import { isFirefoxBrowser } from "./utils.js";
import { computeOfflineSpectrum, rebuildHudFrequencySpectrogram } from "./analysis.js";
import { applyHudFormatPreset, applyViewportColorMode, clearHistory, rebuildWaveform, renderSceneWithHud, updateFps, updateLighting, updateMaterialProperties, updateMatrices, updateViewportLogoLayout } from "./renderer.js";
import { applyCameraPreset, fitViewport, getViewportResolutionDimensions, markCameraPresetCustom, resetCamera, resize, toggleFullscreen, updateExportFormatControls, updateRendererResolution, updateSinusoidalCamera, viewportResizeObserver } from "./viewport.js";
import { commitTimelineSeek, syncPlaybackTimeline, synchronizeCascadeToAudioTime, togglePlayback, updateOutputAudioLevel } from "./playback.js";
import { enforceSelectedLoop, loopModalController, syncLoopButton } from "./loop.js";
import { hideFftLoadProgress, loadAudioFile, setFftLoadProgress } from "./loader.js";
import { initializeSectionResetButtons } from "./reset.js";
import { applyPerformancePreset, applySettings, bindCheckbox, bindColor, bindNumber, deleteLocalPreset, initializeCollapsibleSections, lightingBindings, loadLocalPreset, materialBindings, matrixBindings, rebuildBindings, refreshSavedPresetList, saveLocalPreset, syncControlsFromState, updateMaterialControlVisibility } from "./controls.js";
import { exportPng, exportSettings, exportVideo, requestVideoExportCancel, setVideoExportStatus, updateVideoExportFormatUi } from "./export.js";

controls.addEventListener("start", () => {
  markCameraPresetCustom();
});

audioFileInput.addEventListener("change", (event) => {
  loadAudioFile(event.target.files?.[0]);
});

playButton.addEventListener("click", togglePlayback);

clearButton.addEventListener("click", () => clearHistory(true));

loopButton.addEventListener("click", () => loopModalController.open());

audio.addEventListener("play", () => {
  playButton.textContent = "Pause";
  runtime.nextCaptureAudioTime = audio.currentTime;
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
  runtime.loopWrapPending = false;
  syncPlaybackTimeline(audio.currentTime);
});

audio.addEventListener("timeupdate", () => {
  if (!runtime.isSeeking) {
    syncPlaybackTimeline(audio.currentTime);
  }
});

timeline.addEventListener("pointerdown", () => {
  runtime.isSeeking = true;
});

timeline.addEventListener("input", () => {
  syncPlaybackTimeline(audio.currentTime, true);
});

timeline.addEventListener("change", commitTimelineSeek);

timeline.addEventListener("pointerup", () => {
  if (runtime.isSeeking) {
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
    runtime.nextCaptureAudioTime = audio.currentTime;
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
  const progressVersion = ++runtime.fftProgressVersion;

  state.fftSize = requestedFftSize;

  if (!runtime.decodedAudioBuffer) {
    if (runtime.analyser) {
      runtime.analyser.fftSize = state.fftSize;
      runtime.waveformData = new Uint8Array(runtime.analyser.fftSize);
      runtime.frequencyData = new Uint8Array(
        runtime.analyser.frequencyBinCount
      );
    }

    clearHistory();
    hideFftLoadProgress();
    return;
  }

  setFftLoadProgress(5, `Preparing ${state.fftSize} FFT resolution…`);
  await new Promise((resolve) => requestAnimationFrame(resolve));

  if (progressVersion !== runtime.fftProgressVersion) {
    return;
  }

  setFftLoadProgress(42, "Reconfiguring audio analyser…");

  if (runtime.analyser) {
    runtime.analyser.fftSize = state.fftSize;
    runtime.waveformData = new Uint8Array(runtime.analyser.fftSize);
    runtime.frequencyData = new Uint8Array(
      runtime.analyser.frequencyBinCount
    );
  }

  await new Promise((resolve) => requestAnimationFrame(resolve));

  if (progressVersion !== runtime.fftProgressVersion) {
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
    shouldCancel: () => progressVersion !== runtime.fftProgressVersion,
    onProgress: (amount) => {
      setFftLoadProgress(
        78 + amount * 21,
        `Analyzing viewport frequency graph · ${Math.round(amount * 100)}%`
      );
    }
  });

  if (progressVersion !== runtime.fftProgressVersion) {
    return;
  }

  setFftLoadProgress(100, `${state.fftSize} FFT ready`);
  hideFftLoadProgress(900);
});

rebuildBindings.forEach(([inputId, outputId, key, decimals]) => {
  bindNumber(inputId, outputId, key, decimals, () => {
    state.hudLayer = null;
    rebuildWaveform();
    updateLighting();
    resetCamera();
  });
});

matrixBindings.forEach(([inputId, outputId, key, decimals]) => {
  bindNumber(inputId, outputId, key, decimals, () => {
    runtime.matrixDirty = true;
    updateLighting();
  });
});

bindCheckbox("lightMode", "lightMode", () => {
  applyViewportColorMode(true);
  updateViewportLogoLayout();
  updateMatrices();
});

bindCheckbox("amplitudeColor", "amplitudeColor", () => {
  runtime.matrixDirty = true;
  updateMatrices();
});

document
  .getElementById("amplitudeColormap")
  .addEventListener("change", (event) => {
    state.amplitudeColormap = event.target.value;
    runtime.matrixDirty = true;
    updateMatrices();
  });

bindNumber(
  "colormapSensitivity",
  "colormapSensitivityValue",
  "colormapSensitivity",
  2,
  () => {
    runtime.matrixDirty = true;
    updateMatrices();
  }
);

bindCheckbox("reverseColormap", "reverseColormap", () => {
  runtime.matrixDirty = true;
  updateMatrices();
});

bindColor("cubeColor", "cubeColor", () => {
  state.undersideColor = state.cubeColor;
  runtime.matrixDirty = true;
  updateMatrices();
  status.textContent = `Waveform color: ${state.cubeColor}`;
});

bindColor("peakColor", "peakColor", () => {
  runtime.matrixDirty = true;
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

materialBindings.forEach(([inputId, outputId, key, decimals]) => {
  bindNumber(
    inputId,
    outputId,
    key,
    decimals,
    updateMaterialProperties
  );
});

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

window.addEventListener("resize", resize);

viewportResizeObserver.observe(viewport);

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

  if (runtime.isExportingVideo || runtime.isExportingPng) {
    return;
  }

  enforceSelectedLoop();

  if (!runtime.isSeeking && audio.src && !audio.paused) {
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
