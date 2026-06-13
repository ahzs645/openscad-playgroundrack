# OpenSCAD Playground – Portfolio Edition

This fork of ochafik’s original OpenSCAD Playground keeps the proven WASM renderer and Monaco-driven editing environment, but layers on a gallery-first experience aimed at showcasing curated models. Highlights:

- **Gallery landing page** – Visiting `http://localhost:4000/` opens a full-screen model gallery. Selecting a card navigates directly to the viewer with the model loaded.
- **In-app gallery dialog** – Inside the playground UI, the “Gallery” button opens the same browsing experience as a dialog for quick project switching.
- **Direct linking** – URLs such as `?model=3D%20Rack%20SCAD` load the viewer with that model and skip the landing page. `?editor=off` (or the matching `.env` flag) keeps the editor hidden for kiosk deployments.
- **Runtime configuration** – Point-and-click options plus `.env`, query-string, or `window.OPENSCAD_PLAYGROUND_CONFIG` flags let you control editor visibility and gallery behaviour without code changes.

The sections below retain the upstream documentation for reference and build instructions, with additional notes where behaviour differs.

---

## Quick Start

### Installation and Running

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd openscad-playgroundrack
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build libraries** (download WASM and OpenSCAD libraries)
   ```bash
   npm run build:libs
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Open your browser** to `http://localhost:4000/`

### First Time Setup

When you first run the application, you'll see a full-screen gallery landing page with all available models. Click any card to open that model in the viewer.

## Usage

### Accessing the Application

- **Gallery Landing Page**: Visit `http://localhost:4000/` to see all available models
- **Direct Model Loading**: Use `?model=<ModelName>` to load a specific model directly
  - Example: `http://localhost:4000/?model=3D%20Rack%20SCAD`
- **In-App Gallery**: Click the "Gallery" button in the top-right to browse models while using the app

### Working with Models

#### Opening a Model
1. From the landing page, click any project card
2. Or use the Gallery button inside the app
3. Or navigate directly via URL parameter

#### Rendering Engines
Each model renders with one of two engines, chosen per project:
- **OpenSCAD** (default): `.scad` sources compiled to meshes by OpenSCAD WASM
- **OpenCASCADE (OCCT)**: `.occt.js` JavaScript models built as exact BREP
  solids via [occt-wasm](https://github.com/andymai/occt-wasm), with native
  (lossless) STEP export

Set `"engine": "occt"` in a project's `project.json` (or use a `.js` entry
file). See [OCCT_MODELS.md](./OCCT_MODELS.md) for the authoring guide, and
`Models/Parametric Gel Comb (OCCT)` for an OCCT port of the OpenSCAD
Parametric Gel Comb model.

#### Editor Controls
- **F5**: Quick preview (fast render)
- **F6** or **Ctrl+Enter**: Full render (slower but complete)
- **F7**: Export model

#### View Modes
- **Single Panel Mode**: Shows one panel at a time (Editor, Viewer, or Customizer)
- **Side-by-Side Mode**: Shows multiple panels simultaneously
- Toggle between modes using the settings menu (gear icon)

### Configuration Options

#### Environment Variables (`.env` file)

Create a `.env` file in the root directory to configure the application:

```env
# Hide the code editor (viewer/customizer only mode)
PLAYGROUND_EDITOR_ENABLED=false

# Hide the "Show/Hide Editor" toggle button
PLAYGROUND_EDITOR_TOGGLE=false

# Enable Kanban board view in gallery
PLAYGROUND_KANBAN_ENABLED=true
```

**Note**: After changing `.env`, restart the dev server or rebuild for changes to take effect.

#### URL Query Parameters

Override settings at runtime using URL parameters:
- `?editor=off` - Disable the editor
- `?editorToggle=off` - Hide the editor toggle button
- `?model=ProjectName` - Load a specific model
- `?customizer=open` - Open customizer panel by default

Example: `http://localhost:4000/?model=Keyguard%20with%20Raised%20Tabs&editor=off`

---

[Open the Demo](https://ochafik.com/openscad2)

<a href="https://ochafik.com/openscad2" target="_blank">
<img width="694" alt="image" src="https://github.com/user-attachments/assets/58305f27-7e95-4c56-9cd7-0d766e0a21ae" />
</a>

This is a limited port of [OpenSCAD](https://openscad.org) to WebAssembly, using at its core a headless WASM build of OpenSCAD ([done by @DSchroer](https://github.com/DSchroer/openscad-wasm)), wrapped in a UI made of pretty [PrimeReact](https://github.com/primefaces/primereact) components, a [React Monaco editor](https://github.com/react-monaco-editor/react-monaco-editor) (VS Codesque power!), and an interactive [model-viewer](https://modelviewer.dev/) renderer.

It defaults to the [Manifold backend](https://github.com/openscad/openscad/pull/4533) so it's **super** fast.

Enjoy!

Licenses: see [LICENSES](./LICENSE).

## Features

- Automatic preview on edit (F5), and full rendering on Ctrl+Enter (or F6). Using a trick to force $preview=true.
- [Customizer](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Customizer) support
- **Static 3D model support** - Display pre-rendered GLTF, GLB, STL, and other 3D formats alongside OpenSCAD projects (see [STATIC_MODELS.md](./STATIC_MODELS.md))
- Syntax highlighting
- Ships with many standard SCAD libraries (can browse through them in the UI)
- Autocomplete of imports
- Autocomplete of symbols / function calls (pseudo-parses file and its transitive imports)
- Responsive layout. On small screens editor and viewer are stacked onto each other, while on larger screens they can be side-by-side
- Installable as a PWA (then persists edits in localStorage instead of the hash fragment). On iOS just open the sharing panel and tap "Add to Home Screen". *Should not* require any internet connectivity once cached.

## Roadmap

- [x] Add tests!
- [x] Persist camera state
- [x] Support 2D somehow? (e.g. add option in OpenSCAD to output 2D geometry as non-closed polysets, or to auto-extrude by some height)
- [x] Proper Preview rendering: have OpenSCAD export the preview scene to a rich format (e.g. glTF, with some parts being translucent when prefixed w/ % modifier) and display it using https://modelviewer.dev/ maybe)
- ~~Rebuild w/ (and sync) ochafik@'s filtered kernel (https://github.com/openscad/openscad/pull/4160) to fix(ish) 2D operations~~
- [x] Bundle more examples (ask users to contribute)
- Animation rendering (And other formats than STL)
- [x] Compress URL fragment
- [x] Mobile (iOS) editing support: switch to https://www.npmjs.com/package/react-codemirror ?
- [x] Replace Makefile w/ something that reads the libs metadata
- [ ] Merge modifiers rendering code to openscad
- Model /home fs in shared state. have two clear paths: /libraries for builtins, and /home for user data. State pointing to /libraries paths needs not store the data except if there's overrides (flagged as modifications in the file picker)
- Drag and drop of files (SCAD, STL, etc) and Zip archives. For assets, auto insert the corresponding import.
- Fuller PWA support w/ link Sharing, File opening / association to *.scad files... 
- Look into accessibility
- Setup [OPENSCADPATH](https://en.wikibooks.org/wiki/OpenSCAD_User_Manual/Libraries#Setting_OPENSCADPATH) env var w/ Emscripten to ensure examples that include assets / import local files will run fine.
- Detect which bundled libraries are included / used in the sources and only download these rather than wait for all of the zips. Means the file explorer would need to be more lazy or have some prebuilt hierarchy.
- Preparse builtin libraries definitions at compile time, ship the JSON.

## Building

The project uses a **webpack-based build system** that reads library metadata from `libs-config.json` to automatically download, clone, and package OpenSCAD libraries and dependencies. This replaces the previous Makefile approach with a more standard, maintainable solution.

Prerequisites:
*   wget or curl
*   Node.js (>=18.12.0)
*   npm
*   git
*   zip
*   Docker able to run amd64 containers (only needed if building WASM from source). If running on a different platform (including Silicon Mac), you can add support for amd64 images through QEMU with:

  ```bash
  docker run --privileged --rm tonistiigi/binfmt --install all
  ```

Local dev:

```bash
npm run build:libs  # Download WASM and build all OpenSCAD libraries
npm install
npm run start
# http://localhost:4000/
```

Local prod (test both the different inlining and serving under a prefix):

```bash
npm run build:libs  # Download WASM and build all OpenSCAD libraries
npm install
npm run start:production
# http://localhost:3000/dist/
```

Deployment (edit "homepage" in `package.json` to match your deployment root!):

```bash
npm run build:all  # Build libraries and compile the application
npm install

rm -fR ../ochafik.github.io/openscad2 && cp -R dist ../ochafik.github.io/openscad2 
# Now commit and push changes, wait for site update and enjoy!
```

## Build your own WASM binary

The build system fetches a prebuilt OpenSCAD web WASM binary, but you can build your own in a couple of minutes:

- **Optional**: use your own openscad fork / branch:

  ```bash
  rm -fR libs/openscad
  ln -s $PWD/../absolute/path/to/your/openscad libs/openscad
  
  # If you had a native build directory, delete it.
  rm -fR libs/openscad/build
  ```

- Build WASM binary (add `WASM_BUILD=Debug` argument if you'd like to debug any cryptic crashes):

  ```bash
  npm run build:libs:wasm
  ```

- Then continue the build:

  ```bash
  npm run build:libs
  npm run start
  ```

## Adding OpenSCAD libraries

The build system uses a webpack plugin that reads from `libs-config.json` to manage all library dependencies. You'll need to update 3 files (search for BOSL2 for an example):

- [libs-config.json](./libs-config.json): to add the library's metadata including repository URL, branch, and files to include/exclude in the zip archive

- [src/fs/zip-archives.ts](./src/fs/zip-archives.ts): to use the `.zip` archive in the UI (both for file explorer and automatic imports mounting)

- [LICENSE.md](./LICENSE.md): most libraries require proper disclosure of their usage and of their license. If a license is unique, paste it in full, otherwise, link to one of the standard ones already there.

### Library Configuration Format

In `libs-config.json`, add an entry like this:

```json
{
  "name": "LibraryName",
  "repo": "https://github.com/user/repo.git", 
  "branch": "main",
  "zipIncludes": ["*.scad", "LICENSE", "examples"],
  "zipExcludes": ["**/tests/**"],
  "workingDir": "."
}
```

To bundle a directory that lives inside this repository (for example the curated `Models` gallery), omit `repo`/`branch` and use the `localPath` field instead:

```json
{
  "name": "Models",
  "localPath": "Models",
  "zipExcludes": ["__MACOSX/*", "*.DS_Store", "*/.DS_Store"]
}
```

Available build commands:
- `npm run build:libs` - Build all libraries
- `npm run build:libs:clean` - Clean all build artifacts
- `npm run build:libs:wasm` - Download/build just the WASM binary
- `npm run build:libs:fonts` - Download/build just the fonts

Send us a PR, then once it's merged request an update to the hosted https://ochafik.com/openscad2 demo.

## Adding Static 3D Models

In addition to OpenSCAD projects, the gallery can showcase pre-rendered static 3D models (GLTF, GLB, STL, PLY, OBJ, etc.). These models are displayed using the same Google [Model Viewer](https://modelviewer.dev/) that renders OpenSCAD outputs.

### Documentation

- **[Quick Start Guide](./QUICK_START.md)** - 5-minute setup guide for adding your first static model
- **[Static Models Guide](./STATIC_MODELS.md)** - Technical reference and architecture details
- **[Visual Guide](./STATIC_MODELS_VISUAL_GUIDE.md)** - Diagrams, examples, and use cases

### Creating a Static Model Project

1. Create a new directory in the `Models` folder with your project name
2. Add your 3D model file (e.g., `model.gltf`, `model.glb`, etc.)
3. Create a `project.json` file with the following structure:

```json
{
  "title": "My Static Model",
  "entry": "model.gltf",
  "type": "static",
  "description": "A showcase of a pre-rendered 3D model",
  "category": "Showcase",
  "tags": ["static", "model"],
  "author": "Your Name",
  "hidden": false
}
```

4. Optionally, add a thumbnail image (`thumbnail.png`, `thumbnail.jpg`, etc.) for the gallery preview

### Project.json Options

All projects (both OpenSCAD and static models) support the following properties in `project.json`:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | No | Display name in the gallery (defaults to folder name) |
| `entry` | string | Yes | Entry file (e.g., `main.scad` or `model.glb`) |
| `type` | string | No | Set to `"static"` for pre-rendered models (defaults to `"scad"`) |
| `description` | string | No | Project description shown in gallery card |
| `category` | string | No | Category for filtering (e.g., "Organization", "Accessibility") |
| `tags` | string[] | No | Tags for search and filtering |
| `author` | string | No | Project author name |
| `image` | string | No | Custom thumbnail filename (e.g., `"custom.png"`) |
| `status` | string | No | Kanban status: `"ideas"`, `"in-progress"`, `"in-review"`, `"completed"` |
| `hidden` | boolean | No | Set to `true` to hide project from gallery (default: `false`) |

**Example: Hidden project**
```json
{
  "title": "Work in Progress",
  "entry": "prototype.scad",
  "description": "Experimental design - not ready for showcase",
  "hidden": true
}
```

**Note**: Hidden projects can still be accessed directly via URL parameter (e.g., `?model=ProjectName`)

### Managing Projects

#### Adding a New Project

1. Create a folder in the `Models` directory with your project name
2. Add your model files (`.scad`, `.glb`, `.gltf`, etc.)
3. Create a `project.json` file with at least a `title` and `entry` field
4. Optionally add a thumbnail image
5. Run `npm run build:libs` to rebuild the Models archive
6. Restart your dev server or reload the page

#### Hiding a Project

To temporarily hide a project from the gallery without deleting it:

1. Open the project's `project.json` file
2. Add `"hidden": true`
3. Restart the dev server or rebuild

Example:
```json
{
  "title": "My Project",
  "entry": "main.scad",
  "hidden": true
}
```

#### Deleting a Project

1. Delete the project folder from `Models/`
2. Run `npm run build:libs` to rebuild
3. Restart your dev server

### Supported Model Formats

The viewer supports various 3D model formats through the browser's native capabilities:
- **GLTF/GLB** (`.gltf`, `.glb`) - Recommended format with best features
- **STL** (`.stl`) - Common 3D printing format
- **OBJ** (`.obj`) - Wavefront object format
- **PLY** (`.ply`) - Polygon file format
- **OFF** (`.off`) - Object file format

**Example:** See `Models/Atmospheric Sampler/` for a complete static model project example.

### Benefits of Static Models

- **Faster loading** - No need to render or compile OpenSCAD code
- **Complex models** - Display models that may be too complex to render in real-time
- **External sources** - Showcase models created in other 3D software (Blender, CAD tools, etc.)
- **Interactive viewing** - Same AR and camera controls as OpenSCAD renders

## Runtime configuration

You can control the default UI via environment variables stored in a local `.env` file (loaded by the webpack config) before build or `npm start`.

| Variable | Default | Description |
| --- | --- | --- |
| `PLAYGROUND_EDITOR_ENABLED` | `true` | Set to `false`, `0`, `off`, or `no` to disable the Monaco editor entirely (viewer + customizer only). |
| `PLAYGROUND_EDITOR_TOGGLE` | `true` | Set to `false` to hide the editor toggle button while keeping the editor enabled. |

Example `.env`:

```
# Start in kiosk mode
PLAYGROUND_EDITOR_ENABLED=false

# Optional: keep the toggle hidden even when the editor runs
PLAYGROUND_EDITOR_TOGGLE=false
```

Query-string parameters still override everything at runtime: `?editor=off` and `?editorToggle=off` mirror the variables above, while `window.OPENSCAD_PLAYGROUND_CONFIG` remains available for custom embeds.

## Troubleshooting

### Gallery shows "No projects found"

**Solution**: Run `npm run build:libs` to build the Models archive. The gallery loads projects from a zip file that needs to be built first.

### Changes to .env file not taking effect

**Solution**: Environment variables are injected at build time. After modifying `.env`, you must:
- Restart the dev server: Stop (`Ctrl+C`) and run `npm start` again
- Or rebuild: `npm run build`

### Added a new project but it doesn't appear in gallery

**Solutions**:
1. Make sure `project.json` has at least `title` and `entry` fields
2. Run `npm run build:libs` to rebuild the Models archive
3. Refresh the browser or restart the dev server
4. Check that `"hidden": true` is not set in the project.json

### Static model appears as a blank screen

**Solutions**:
1. Verify the `entry` path in `project.json` matches your file name exactly
2. Ensure `"type": "static"` is set in project.json
3. Check browser console for errors
4. Verify the model file format is supported (GLB, GLTF, STL, OBJ, PLY, OFF)

### Editor or render button is hidden

**Check**:
- `.env` file for `PLAYGROUND_EDITOR_ENABLED=false`
- URL parameters like `?editor=off`
- For static models, the editor and render button are automatically hidden

### Models not loading after deployment

**Solution**: Update the `homepage` field in `package.json` to match your deployment URL before building.
