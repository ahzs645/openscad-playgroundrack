import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

import createOcct64 from '@bitbybit-dev/occt/bitbybit-dev-occt-64-bit/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const url = process.argv[2] ?? 'http://localhost:4000/?model=Pre-Chamber+Nozzle+Insert';
const downloadDir = path.join(root, 'tmp', 'step-validation');

async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function waitForDownload(ext, timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const files = await fs.readdir(downloadDir).catch(() => []);
    const complete = files
      .filter(file => file.toLowerCase().endsWith(ext) && !file.endsWith('.crdownload'))
      .map(file => path.join(downloadDir, file));
    if (complete.length > 0) return complete[0];
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${ext} download.`);
}

async function clickByText(page, text) {
  const handles = await page.$$('body *');
  for (const handle of handles) {
    const value = await page.evaluate(el => el.textContent?.trim(), handle);
    if (value === text) {
      await handle.click();
      return;
    }
  }
  throw new Error(`Could not find visible text: ${text}`);
}

async function downloadExports() {
  await cleanDir(downloadDir);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 1000 },
  });
  try {
    const page = await browser.newPage();
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    page.on('console', msg => {
      const text = msg.text();
      if (/error|warn|STEP|OCCT/i.test(text)) console.log(`[browser:${msg.type()}] ${text}`);
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120_000 });
    await page.waitForSelector('button[aria-label="Render"]', { timeout: 120_000 });
    await page.click('button[aria-label="Render"]');
    await page.waitForSelector('button[aria-label="Download STL"]:not([disabled])', { timeout: 240_000 });

    await page.click('button[aria-label="Download STL"]');
    const stlPath = await waitForDownload('.stl');

    await page.click('button.p-splitbutton-menubutton');
    await clickByText(page, 'STEP via OCCT (32-bit)');
    await page.waitForSelector('button[aria-label="Download STEP"]:not([disabled])', { timeout: 120_000 });
    await page.click('button[aria-label="Download STEP"]');
    const stepPath = await waitForDownload('.step', 360_000);

    return { stlPath, stepPath };
  } finally {
    await browser.close();
  }
}

function parseBinaryStl(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const triangles = dv.getUint32(80, true);
  const vertices = [];
  for (let i = 0; i < triangles; i++) {
    const base = 84 + i * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const p = base + v * 12;
      vertices.push([
        dv.getFloat32(p, true),
        dv.getFloat32(p + 4, true),
        dv.getFloat32(p + 8, true),
      ]);
    }
  }
  return vertices;
}

function parseAsciiStl(text) {
  const vertices = [];
  const rx = /vertex\s+([+\-0-9.eE]+)\s+([+\-0-9.eE]+)\s+([+\-0-9.eE]+)/g;
  let match;
  while ((match = rx.exec(text)) !== null) {
    vertices.push([Number(match[1]), Number(match[2]), Number(match[3])]);
  }
  return vertices;
}

function parseStl(buffer) {
  if (buffer.length >= 84) {
    const triCount = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getUint32(80, true);
    if (84 + triCount * 50 === buffer.length) return parseBinaryStl(buffer);
  }
  return parseAsciiStl(new TextDecoder().decode(buffer));
}

function bounds(vertices) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], vertex[i]);
      max[i] = Math.max(max[i], vertex[i]);
    }
  }
  return { min, max, size: max.map((value, i) => value - min[i]) };
}

function maxAbsDelta(a, b) {
  return Math.max(...a.flatMap((value, i) => [Math.abs(value - b[i])]));
}

function centroid(vertices) {
  const c = [0, 0, 0];
  for (const vertex of vertices) {
    c[0] += vertex[0];
    c[1] += vertex[1];
    c[2] += vertex[2];
  }
  return c.map(value => value / vertices.length);
}

async function stepToStl(stepPath) {
  const stepBytes = await fs.readFile(stepPath);
  const stepHeader = new TextDecoder().decode(stepBytes.subarray(0, 256));
  if (!stepHeader.includes('ISO-10303-21')) {
    throw new Error('Downloaded STEP file does not contain ISO-10303-21 header.');
  }
  const occ = await createOcct64();
  const inputName = 'validation-input.step';
  const outputName = 'validation-roundtrip.stl';
  occ.FS.createDataFile('/', inputName, stepBytes, true, true, true);
  const reader = new occ.STEPControl_Reader();
  const readResult = reader.ReadFile(inputName);
  if (readResult !== occ.IFSelect_ReturnStatus.RetDone) {
    throw new Error('OCCT could not read the downloaded STEP file.');
  }
  reader.TransferRoots();
  const shape = reader.OneShape();
  if (!shape || shape.IsNull()) throw new Error('OCCT read an empty STEP shape.');
  try {
    const mesh = new occ.BRepMesh_IncrementalMesh(shape, 0.05, false, 0.5, false);
    const writer = new occ.StlAPI_Writer();
    if (!writer.Write(shape, outputName)) {
      throw new Error('OCCT could not write round-trip STL from STEP.');
    }
    const stlText = occ.FS.readFile(`/${outputName}`, { encoding: 'utf8' });
    const outPath = path.join(downloadDir, 'step-roundtrip.stl');
    await fs.writeFile(outPath, stlText);
    writer.delete();
    mesh.delete();
    return outPath;
  } finally {
    shape.delete?.();
    reader.delete?.();
    try { occ.FS.unlink(`/${inputName}`); } catch {}
    try { occ.FS.unlink(`/${outputName}`); } catch {}
  }
}

const { stlPath, stepPath } = await downloadExports();
const roundTripStlPath = await stepToStl(stepPath);

const openscadVertices = parseStl(await fs.readFile(stlPath));
const stepVertices = parseStl(await fs.readFile(roundTripStlPath));
const openscadBounds = bounds(openscadVertices);
const stepBounds = bounds(stepVertices);
const report = {
  url,
  files: {
    openscadStl: stlPath,
    occtStep: stepPath,
    stepRoundTripStl: roundTripStlPath,
  },
  counts: {
    openscadVertices: openscadVertices.length,
    stepRoundTripVertices: stepVertices.length,
  },
  bounds: {
    openscad: openscadBounds,
    stepRoundTrip: stepBounds,
    minMaxAbsDelta: Math.max(
      maxAbsDelta(openscadBounds.min, stepBounds.min),
      maxAbsDelta(openscadBounds.max, stepBounds.max),
    ),
    sizeAbsDelta: maxAbsDelta(openscadBounds.size, stepBounds.size),
  },
  centroidAbsDelta: maxAbsDelta(centroid(openscadVertices), centroid(stepVertices)),
};

await fs.writeFile(path.join(downloadDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
