#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const versions = ['3.3.1'];
const baseFiles = [
  'index.js',
  'occt-wasm.js',
  'occt-wasm.wasm',
  'types.js',
  'xcaf-document.js',
];

function filesForVersion(version) {
  return version.startsWith('3.3.')
    ? [...baseFiles, 'svg.js']
    : baseFiles;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, targetPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
}

for (const version of versions) {
  const targetDir = path.join('public', 'occt', version);
  await fs.mkdir(targetDir, { recursive: true });

  for (const file of filesForVersion(version)) {
    const targetPath = path.join(targetDir, file);
    if (await exists(targetPath)) {
      continue;
    }
    const url = `https://unpkg.com/occt-wasm@${version}/dist/${file}`;
    console.log(`Fetching ${url}`);
    await download(url, targetPath);
  }
}
