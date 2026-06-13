#!/usr/bin/env node

import OpenSCADLibrariesPlugin from '../webpack-libs-plugin.js';

const buildMode = process.env.LIBS_BUILD_MODE || process.argv[2] || 'all';

const builder = new OpenSCADLibrariesPlugin({ buildMode });
await builder.loadConfig();

switch (buildMode) {
  case 'all':
    await builder.buildAll();
    break;
  case 'wasm':
    await builder.buildWasm();
    break;
  case 'fonts':
    await builder.buildFonts();
    break;
  case 'libs':
    await builder.buildAllLibraries();
    break;
  case 'clean':
    await builder.clean();
    break;
  default:
    throw new Error(`Unknown LIBS_BUILD_MODE: ${buildMode}`);
}
