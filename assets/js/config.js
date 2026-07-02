export const defaults = {
      playbackRate: 1,
      volume: 1,
      muted: false,
      fftSize: 4096,
      sensitivity: 1.5,
      attack: 0.72,
      release: 0.2,
      spatialSmoothing: 9,
      historyBlend: 0.12,
      cascadeRate: 30,

      count: 100,
      historyRows: 100,
      size: 1,
      cubeDepth: 1,
      gap: 0,
      rowSpacing: 1,
      maxHeight: 9,
      minimumHeight: 0.25,

      fadeStart: 0.95,
      fadeCurve: 0.2,
      minimumBrightness: 1,
      scaleFade: 0,
      lightMode: false,
      amplitudeColor: true,
      amplitudeColormap: "grayscale",
      colormapSensitivity: 1.15,
      reverseColormap: false,
      cubeColor: "#000000",
      undersideColor: "#000000",
      peakColor: "#8c75ff",
      backgroundColor: "#000000",

      materialType: "lambert",
      roughness: 0,
      metalness: 0.07,
      clearcoat: 0.92,
      clearcoatRoughness: 1,
      shininess: 60,

      ambientIntensity: 3.9,
      keyIntensity: 5,
      fillIntensity: 0.8,
      lightAzimuth: 0,
      lightElevation: 60,
      exposure: 0.25,
      shadows: true,
      shadowResolution: 2048,
      keyLightColor: "#ffffff",
      fillLightColor: "#ffffff",

      pixelRatio: 2,
      cameraHeight: 54,
      cameraDistance: 78,
      cameraZoom: 1.5,
      autoRotate: false,
      autoRotateSpeed: 0.7,
      sinusoidalCameraActive: false,

      orientation: "landscape",
      aspectRatio: "widescreen",
      viewportSize: 100,
      frequencyGraphPlacement: "top-right",
      waveformGraphPlacement: "bottom-left",
      levelsGraphPlacement: "bottom-right",
      graphWidth: 10,
      graphHeight: 4.5,
      metadataX: 1.5,
      metadataY: 2.5,
      guiTextSize: 0.75,
      hudVisible: true,
      logoVisible: true,
      logoX: 50,
      logoY: 5,
      logoSize: 5.5,
      viewportResolution: "4k",
      videoFileType: "mp4",
      videoFrameRate: 60,
      videoBitrate: 24
    };

export const ALLOWED_COLORMAPS = new Set([
      "autumn",
      "bone",
      "cool",
      "custom",
      "gist_heat",
      "gnuplot2",
      "grayscale",
      "hot",
      "inferno",
      "jet",
      "magma",
      "neon",
      "plasma",
      "rainbow",
      "sunset",
      "turbo",
      "viridis"
    ]);

const DARK_VIEWPORT_BACKGROUND = "#000000";
export const LIGHT_VIEWPORT_BACKGROUND = "#ffffff";
export const DARK_MODE_HUD_COLOR = "#ffffff";
export const LIGHT_MODE_HUD_COLOR = "#000000";

export const AMPLITUDE_COLORMAPS = {
      viridis: [
        [0.00, "#440154"],
        [0.25, "#3b528b"],
        [0.50, "#21918c"],
        [0.75, "#5ec962"],
        [1.00, "#fde725"]
      ],
      plasma: [
        [0.00, "#0d0887"],
        [0.25, "#7e03a8"],
        [0.50, "#cc4778"],
        [0.75, "#f89540"],
        [1.00, "#f0f921"]
      ],
      inferno: [
        [0.00, "#000004"],
        [0.25, "#420a68"],
        [0.50, "#932667"],
        [0.75, "#dd513a"],
        [1.00, "#fcffa4"]
      ],
      magma: [
        [0.00, "#000004"],
        [0.25, "#3b0f70"],
        [0.50, "#8c2981"],
        [0.75, "#de4968"],
        [1.00, "#fcfdbf"]
      ],
      turbo: [
        [0.00, "#30123b"],
        [0.20, "#466be3"],
        [0.40, "#1bcfd4"],
        [0.60, "#61fc6c"],
        [0.80, "#f9ba38"],
        [1.00, "#7a0403"]
      ],
      coolwarm: [
        [0.00, "#3b4cc0"],
        [0.25, "#8db0fe"],
        [0.50, "#dddddd"],
        [0.75, "#f4987a"],
        [1.00, "#b40426"]
      ],
      grayscale: [
        [0.00, "#101010"],
        [1.00, "#ffffff"]
      ],
      cividis: [
        [0.00, "#00224e"],
        [0.25, "#434e6c"],
        [0.50, "#7d7c78"],
        [0.75, "#bcae6c"],
        [1.00, "#fee838"]
      ],
      cubehelix: [
        [0.00, "#000000"],
        [0.25, "#163d4e"],
        [0.50, "#a07949"],
        [0.75, "#c7b3ed"],
        [1.00, "#ffffff"]
      ],
      spectral: [
        [0.00, "#9e0142"],
        [0.25, "#f46d43"],
        [0.50, "#ffffbf"],
        [0.75, "#66c2a5"],
        [1.00, "#5e4fa2"]
      ],
      rainbow: [
        [0.00, "#6e40aa"],
        [0.20, "#2f7de1"],
        [0.40, "#20c997"],
        [0.60, "#a8e10c"],
        [0.80, "#ff9f1c"],
        [1.00, "#d7191c"]
      ],
      ocean: [
        [0.00, "#001219"],
        [0.25, "#005f73"],
        [0.50, "#0a9396"],
        [0.75, "#94d2bd"],
        [1.00, "#e9d8a6"]
      ],
      fire: [
        [0.00, "#090000"],
        [0.25, "#6b0000"],
        [0.50, "#d73000"],
        [0.75, "#ff9d00"],
        [1.00, "#fff7b2"]
      ],
      ice: [
        [0.00, "#020024"],
        [0.25, "#003f88"],
        [0.50, "#00b4d8"],
        [0.75, "#90e0ef"],
        [1.00, "#ffffff"]
      ],
      sunset: [
        [0.00, "#2b1055"],
        [0.25, "#6a0572"],
        [0.50, "#c9184a"],
        [0.75, "#ff7b00"],
        [1.00, "#ffd166"]
      ],
      forest: [
        [0.00, "#071a0c"],
        [0.25, "#124e2a"],
        [0.50, "#2d7d46"],
        [0.75, "#74c365"],
        [1.00, "#e8f5b5"]
      ],
      neon: [
        [0.00, "#12002f"],
        [0.25, "#6f00ff"],
        [0.50, "#ff00c8"],
        [0.75, "#00f5ff"],
        [1.00, "#d7ff00"]
      ],
      bone: [
        [0.00, "#000000"],
        [0.25, "#243447"],
        [0.50, "#6f7f80"],
        [0.75, "#b9c7c2"],
        [1.00, "#ffffff"]
      ],
      gnuplot2: [
        [0.00, "#000000"],
        [0.20, "#0000cc"],
        [0.40, "#9900cc"],
        [0.60, "#e60055"],
        [0.80, "#ff9900"],
        [1.00, "#ffffe6"]
      ],
      twilight: [
        [0.00, "#2f1438"],
        [0.20, "#3d4c9a"],
        [0.40, "#9bb7c9"],
        [0.50, "#e2d9d5"],
        [0.60, "#c89a9d"],
        [0.80, "#7b335f"],
        [1.00, "#2f1438"]
      ],
      gist_heat: [
        [0.00, "#000000"],
        [0.25, "#650000"],
        [0.50, "#d40000"],
        [0.75, "#ffb000"],
        [1.00, "#ffffff"]
      ],
      cool: [
        [0.00, "#00ffff"],
        [1.00, "#ff00ff"]
      ],
      hot: [
        [0.00, "#0b0000"],
        [0.33, "#ff0000"],
        [0.66, "#ffff00"],
        [1.00, "#ffffff"]
      ],
      jet: [
        [0.00, "#000080"],
        [0.17, "#0000ff"],
        [0.35, "#00ffff"],
        [0.50, "#7fff7f"],
        [0.65, "#ffff00"],
        [0.83, "#ff0000"],
        [1.00, "#800000"]
      ],
      terrain: [
        [0.00, "#333399"],
        [0.20, "#0073e6"],
        [0.40, "#29a329"],
        [0.60, "#b8b35a"],
        [0.80, "#8c6239"],
        [1.00, "#ffffff"]
      ],
      copper: [
        [0.00, "#000000"],
        [0.25, "#4d3026"],
        [0.50, "#9a604c"],
        [0.75, "#e79072"],
        [1.00, "#ffc77f"]
      ],
      spring: [
        [0.00, "#ff00ff"],
        [1.00, "#ffff00"]
      ],
      autumn: [
        [0.00, "#ff0000"],
        [1.00, "#ffff00"]
      ],
      winter: [
        [0.00, "#0000ff"],
        [1.00, "#00ff80"]
      ]
    };

export const COLORMAP_INDEX = {
      custom: 0,
      viridis: 1,
      plasma: 2,
      inferno: 3,
      magma: 4,
      turbo: 5,
      coolwarm: 6,
      grayscale: 7,
      cividis: 8,
      cubehelix: 9,
      spectral: 10,
      rainbow: 11,
      ocean: 12,
      fire: 13,
      ice: 14,
      sunset: 15,
      forest: 16,
      neon: 17,
      bone: 18,
      gnuplot2: 19,
      twilight: 20,
      gist_heat: 21,
      cool: 22,
      hot: 23,
      jet: 24,
      terrain: 25,
      copper: 26,
      spring: 27,
      autumn: 28,
      winter: 29
    };

export const CAMERA_PRESETS = Object.freeze({
      front: { position: [0, 42, 92], targetHeight: 0 },
      wide: { position: [0, 60, 150], targetHeight: 0 },
      close: { position: [0, 24, 55], targetHeight: 0 },
      low: { position: [0, 10, 80], targetHeight: 4 },
      high: { position: [0, 104, 74], targetHeight: 0 },
      top: { position: [0, 140, 10], targetHeight: 0 },
      left: { position: [-92, 54, 78], targetHeight: 0 },
      right: { position: [92, 54, 78], targetHeight: 0 },
      rear: { position: [0, 42, -150], targetHeight: 0 },
      sinusoidal: {
        position: [0, 50, 112],
        targetHeight: 0,
        motion: "sinusoidal"
      }
    });

export const SECTION_DEFAULT_KEYS = Object.freeze({
      Audio: [
        "playbackRate", "volume", "muted", "fftSize", "sensitivity",
        "attack", "release", "spatialSmoothing", "historyBlend",
        "cascadeRate"
      ],
      Viewport: ["orientation", "aspectRatio", "viewportSize"],
      "Viewport HUD": [
        "hudVisible", "logoVisible", "logoX", "logoY", "logoSize",
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
      "Presets & Utilities": []
    });
