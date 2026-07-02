// renderer.js — generated module split of the Spectrogramic Voxel Engine (behavior unchanged)
// Terrain geometry, materials, colormap shader, HUD drawing, draw loop pieces.
import * as THREE from "three";
import { AMPLITUDE_COLORMAPS, COLORMAP_INDEX, DARK_MODE_HUD_COLOR, DARK_VIEWPORT_BACKGROUND, DISTANCE_SPACING_EXPANSION, HUD_FREQUENCY_DB_MAX, HUD_FREQUENCY_DB_MIN, HUD_FREQUENCY_DB_STEP, HUD_FREQUENCY_MAX_HZ, HUD_FREQUENCY_MIN_HZ, LIGHT_MODE_HUD_COLOR, LIGHT_VIEWPORT_BACKGROUND } from "./config.js";
import { ambientLight, audio, camera, colormapColorA, colormapColorB, dummy, fillLight, fpsCounter, hudCamera, hudCanvas, hudContext, hudDrawingBufferSize, hudMaterial, hudScene, keyLight, renderer, runtime, scene, state, viewportFrame, viewportLogo, waveformGroup } from "./core.js";
import { clamp, hexToHudRgba } from "./utils.js";
import { getHudLevelData, getHudSpectrumData, getHudWaveformData } from "./analysis.js";
import { getViewportFormatName } from "./viewport.js";
import { setOutputValue } from "./controls.js";

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

export function sampleAmplitudeColormap(name, amount, target) {
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

export function createGradientUniforms(baseColor) {
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

export function installVerticalColormapShader(material, baseColor) {
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

export function createCubeMaterial(baseColor) {
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

export function disposeWaveformMeshes() {
  for (const mesh of [...runtime.upperRowMeshes, ...runtime.undersideRowMeshes]) {
    waveformGroup.remove(mesh);
    mesh.material.dispose();
  }

  runtime.upperRowMeshes = [];
  runtime.undersideRowMeshes = [];

  if (runtime.waveformGeometry) {
    runtime.waveformGeometry.dispose();
    runtime.waveformGeometry = null;
  }
}

export function resetHistoryStorage() {
  runtime.historyData = new Float32Array(state.count * state.historyRows);
  runtime.smoothedSamples = new Float32Array(state.count);
  runtime.historyHead = 0;
  runtime.historyCount = 0;
  runtime.matrixDirty = true;
}

export function configureRowMesh(mesh) {
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = state.shadows;
  mesh.receiveShadow = state.shadows;
  mesh.frustumCulled = false;
  waveformGroup.add(mesh);
}

export function rebuildWaveform() {
  disposeWaveformMeshes();

  runtime.waveformGeometry = new THREE.BoxGeometry(1, 1, 1);

  for (let age = 0; age < state.historyRows; age++) {
    const upperMesh = new THREE.InstancedMesh(
      runtime.waveformGeometry,
      createCubeMaterial(state.cubeColor),
      state.count
    );

    const undersideMesh = new THREE.InstancedMesh(
      runtime.waveformGeometry,
      createCubeMaterial(state.undersideColor),
      state.count
    );

    configureRowMesh(upperMesh);
    configureRowMesh(undersideMesh);

    runtime.upperRowMeshes.push(upperMesh);
    runtime.undersideRowMeshes.push(undersideMesh);
  }

  resetHistoryStorage();
  updateMatrices();
}

export function updateMaterialProperties() {
  const meshes = [...runtime.upperRowMeshes, ...runtime.undersideRowMeshes];

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

  runtime.matrixDirty = true;
}

export function clearHistory(showBlankGrid = false) {
  runtime.forceBlankHistoryGrid = Boolean(showBlankGrid);
  resetHistoryStorage();
  updateMatrices();
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
  hudContext.clearRect(0, 0, width, height);
  const staticLayer = ensureHudStaticLayer(width, height);
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

export function getHistoryValue(age, sampleIndex) {
  if (age >= runtime.historyCount) {
    return 0;
  }

  const rowIndex = (runtime.historyHead + age) % state.historyRows;
  return runtime.historyData[rowIndex * state.count + sampleIndex];
}

export function calculateFade(age) {
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

export function updateMaterialGradientUniforms(
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

export function updateRowVerticalColors(age, fade) {
  const upperMesh = runtime.upperRowMeshes[age];
  const undersideMesh = runtime.undersideRowMeshes[age];

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

export function setHiddenInstance(mesh, instanceIndex, z) {
  dummy.position.set(0, 0, z);
  dummy.scale.set(0.0001, 0.0001, 0.0001);
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(instanceIndex, dummy.matrix);
}

export function getProgressiveHorizontalPosition(sampleIndex, age) {
  const centerIndex = (state.count - 1) / 2;
  const centeredIndex = sampleIndex - centerIndex;
  const maximumAge = Math.max(1, state.historyRows - 1);
  const normalizedDepth = age / maximumAge;
  const horizontalSpacing =
    (state.size + state.gap) *
    (1 + DISTANCE_SPACING_EXPANSION * normalizedDepth);

  return centeredIndex * horizontalSpacing;
}

export function getProgressiveDepthPosition(age) {
  const maximumAge = Math.max(1, state.historyRows - 1);
  const normalizedDistance = age / maximumAge;

  return -age * state.rowSpacing *
    (1 + DISTANCE_SPACING_EXPANSION * normalizedDistance);
}

export function getHistoryBackZ() {
  return getProgressiveDepthPosition(
    Math.max(0, state.historyRows - 1)
  );
}

export function getHistoryDepthCenter() {
  return getHistoryBackZ() / 2;
}

export function updateMatrices() {
  if (
    runtime.upperRowMeshes.length !== state.historyRows ||
    runtime.undersideRowMeshes.length !== state.historyRows ||
    !runtime.matrixDirty
  ) {
    return;
  }

  const frequencyMode =
    state.analysisMode === "frequency";
  const showBlankBlocks =
    runtime.historyCount === 0 &&
    (!runtime.decodedAudioBuffer || runtime.forceBlankHistoryGrid);

  for (let age = 0; age < state.historyRows; age++) {
    const upperMesh = runtime.upperRowMeshes[age];
    const undersideMesh = runtime.undersideRowMeshes[age];
    const z = getProgressiveDepthPosition(age);
    const fade = calculateFade(age);

    upperMesh.visible = true;
    undersideMesh.visible = !frequencyMode;

    updateRowVerticalColors(age, fade);

    for (let sampleIndex = 0; sampleIndex < state.count; sampleIndex++) {
      if (age >= runtime.historyCount && !showBlankBlocks) {
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

  runtime.matrixDirty = false;
}

export function updateLighting() {
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

  for (const mesh of [...runtime.upperRowMeshes, ...runtime.undersideRowMeshes]) {
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

export function updateFps(now) {
  runtime.fpsFrames++;

  const elapsed = now - runtime.fpsLastUpdate;

  if (elapsed >= 500) {
    runtime.displayedFps = Math.round((runtime.fpsFrames * 1000) / elapsed);
    fpsCounter.textContent = `FPS ${runtime.displayedFps}`;

    runtime.fpsFrames = 0;
    runtime.fpsLastUpdate = now;
  }
}
