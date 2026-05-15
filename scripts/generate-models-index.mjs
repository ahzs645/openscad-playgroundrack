#!/usr/bin/env node
// Scans the Models/ directory and produces:
//   - Models/index.json  (the list of projects the gallery loads)
//   - A consolidated manifest baked into Models/manifest.json so the
//     gallery can fetch one file instead of N+1 project.jsons.
//
// Run via `npm run build:models-index` or automatically via `prebuild`
// and `prestart`. Drop a folder into Models/, re-run, and it shows up.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, '..', 'Models');

const STATIC_ENTRY_EXTS = ['.glb', '.gltf', '.stl', '.obj', '.usdz', '.3mf'];
const SCAD_ENTRY_EXTS = ['.scad'];
const THUMBNAIL_CANDIDATES = ['thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg', 'thumbnail.webp', 'thumbnail.svg'];

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function findEntry(dir, exts) {
  const entries = fs.readdirSync(dir);
  // Prefer main.scad / Main.scad style entry points
  const preferred = ['main', 'Main', 'index'];
  for (const base of preferred) {
    for (const ext of exts) {
      const candidate = base + ext;
      if (entries.includes(candidate)) return candidate;
    }
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const ext = path.extname(name).toLowerCase();
    if (exts.includes(ext)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile()) return name;
    }
  }
  return null;
}

function findThumbnail(dir, declared) {
  if (declared && fs.existsSync(path.join(dir, declared))) return declared;
  for (const candidate of THUMBNAIL_CANDIDATES) {
    if (fs.existsSync(path.join(dir, candidate))) return candidate;
  }
  return null;
}

function humanize(name) {
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function scanProject(name) {
  const dir = path.join(MODELS_DIR, name);
  if (!fs.statSync(dir).isDirectory()) return null;
  if (name.startsWith('.') || name === 'node_modules') return null;

  const projectJsonPath = path.join(dir, 'project.json');
  const projectJson = readJSON(projectJsonPath) ?? {};

  const declaredType = projectJson.type === 'static' ? 'static' : (projectJson.type === 'scad' ? 'scad' : null);

  // Figure out entry file
  let entry = typeof projectJson.entry === 'string' ? projectJson.entry : null;
  const entryExists = entry ? fs.existsSync(path.join(dir, entry)) : false;

  let type = declaredType;
  if (!entryExists) {
    // Try to auto-detect a sensible entry
    if (type === 'static') {
      entry = findEntry(dir, STATIC_ENTRY_EXTS);
    } else if (type === 'scad') {
      entry = findEntry(dir, SCAD_ENTRY_EXTS);
    } else {
      const scad = findEntry(dir, SCAD_ENTRY_EXTS);
      if (scad) {
        entry = scad;
        type = 'scad';
      } else {
        const staticFile = findEntry(dir, STATIC_ENTRY_EXTS);
        if (staticFile) {
          entry = staticFile;
          type = 'static';
        }
      }
    }
  } else if (!type) {
    const ext = path.extname(entry).toLowerCase();
    type = SCAD_ENTRY_EXTS.includes(ext) ? 'scad' : 'static';
  }

  if (!entry) {
    console.warn(`[models-index] skipping ${name}: no entry file found`);
    return null;
  }

  const declaredEntry = typeof projectJson.entry === 'string' ? projectJson.entry : null;
  if (declaredEntry && declaredEntry !== entry) {
    console.warn(`[models-index] ${name}: project.json entry "${declaredEntry}" not found; using "${entry}"`);
  }

  const thumbnail = findThumbnail(dir, projectJson.image || projectJson.thumbnail);

  return {
    id: name,
    title: projectJson.title || humanize(name),
    description: projectJson.description,
    category: projectJson.category,
    tags: Array.isArray(projectJson.tags) ? projectJson.tags : undefined,
    author: projectJson.author,
    entry,
    type,
    image: thumbnail || undefined,
    status: projectJson.status,
    hidden: projectJson.hidden === true,
    created: projectJson.created,
  };
}

function main() {
  if (!fs.existsSync(MODELS_DIR)) {
    console.error(`[models-index] Models directory not found at ${MODELS_DIR}`);
    process.exit(1);
  }

  const names = fs.readdirSync(MODELS_DIR)
    .filter((n) => !n.startsWith('.') && !n.endsWith('.json'))
    .sort();

  const projects = [];
  for (const name of names) {
    const full = path.join(MODELS_DIR, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const project = scanProject(name);
    if (project) projects.push(project);
  }

  // Sort by title for stable, human-friendly ordering
  projects.sort((a, b) => a.title.localeCompare(b.title));

  // index.json keeps the legacy shape (list of folder names) so older
  // consumers/bookmarks still work, but is regenerated from disk now.
  const indexJson = {
    generatedAt: new Date().toISOString(),
    projects: projects.map((p) => p.id),
  };

  // manifest.json is the new single-fetch payload the gallery uses.
  const manifest = {
    generatedAt: new Date().toISOString(),
    projects,
  };

  fs.writeFileSync(path.join(MODELS_DIR, 'index.json'), JSON.stringify(indexJson, null, 2) + '\n');
  fs.writeFileSync(path.join(MODELS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const visible = projects.filter((p) => !p.hidden).length;
  console.log(`[models-index] wrote ${projects.length} projects (${visible} visible) to Models/index.json + manifest.json`);
}

main();
