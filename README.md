# Spectrogramic Voxel Engine

A static, GitHub Pages-ready version of the Spectrogramic Voxel Engine audio visualizer. No build step is required.

## Project structure

```text
index.html
assets/
  css/
    main.css
  js/
    config.js    Immutable defaults, colormap tables, camera presets, HUD constants
    core.js      Shared state, DOM element handles, THREE.js scene setup, runtime state
    utils.js     Pure helpers (formatting, math, files, blobs)
    analysis.js  FFT, audio analysis, offline sampling, HUD spectrum/level data
    renderer.js  Terrain geometry, materials, colormap shader, HUD drawing
    viewport.js  Viewport sizing, resolution presets, camera presets, fullscreen
    playback.js  Audio graph, synchronized playback clock, timeline seek
    loop.js      Loop selection/enforcement, BPM detection, loop editor popup
    loader.js    Audio file loading and progress UI
    reset.js     Reset-to-defaults for each control section
    controls.js  Control bindings, settings snapshot/apply, local presets, sections
    export.js    PNG / video / JSON settings export
    app.js       Entry point: wires events and boots the app
```

The JavaScript is split into focused ES modules that share a single `core.js`
(state, DOM handles, and the mutable `runtime` object) so each concern can be
edited in isolation. `app.js` imports the modules, binds all event listeners,
and starts the render loop.

## Local testing

Because the JavaScript uses ES modules, serve the folder over HTTP rather than opening `index.html` directly from the filesystem.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## External browser resources

The app loads three.js from jsDelivr via the import map in `index.html`, and video-export muxer libraries on demand. An internet connection is required when the app first loads or exports video.
