// Loads the gallery project list from Models/manifest.json (preferred) or
// falls back to the legacy index.json + per-project.json walk. The result
// is cached at module scope so reopening the gallery is instant.

export interface BrowserProject {
  id: string;
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  author?: string;
  entry: string;
  entryPath: string;
  type: 'scad' | 'static';
  image?: string;
  status?: 'ideas' | 'in-progress' | 'in-review' | 'completed';
  hidden?: boolean;
}

const MODELS_BASE_PATH = '/libraries/Models';
const MODELS_HTTP_BASE = '/Models';

let cache: BrowserProject[] | null = null;
let inflight: Promise<BrowserProject[]> | null = null;

async function fetchJSON(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn(`Failed to fetch JSON from ${url}:`, error);
    return null;
  }
}

async function collectFromManifest(): Promise<BrowserProject[]> {
  const manifest = await fetchJSON(`${MODELS_HTTP_BASE}/manifest.json`);
  if (manifest && Array.isArray(manifest.projects)) {
    return manifest.projects.map((p: any): BrowserProject => ({
      id: p.id,
      title: p.title ?? p.id,
      description: p.description,
      category: p.category,
      tags: p.tags,
      author: p.author,
      entry: p.entry,
      entryPath: `${MODELS_BASE_PATH}/${p.id}/${p.entry}`,
      type: p.type === 'static' ? 'static' : 'scad',
      image: p.image
        ? `${MODELS_HTTP_BASE}/${encodeURIComponent(p.id)}/${encodeURIComponent(p.image)}`
        : undefined,
      status: p.status,
      hidden: p.hidden === true,
    })).filter((p: BrowserProject) => !p.hidden)
       .sort((a: BrowserProject, b: BrowserProject) => a.title.localeCompare(b.title));
  }

  const index = await fetchJSON(`${MODELS_HTTP_BASE}/index.json`);
  if (!index || !Array.isArray(index.projects)) {
    console.warn('Failed to load Models index');
    return [];
  }

  const results = await Promise.all(index.projects.map(async (projectName: string) => {
    const projectDir = `${MODELS_HTTP_BASE}/${encodeURIComponent(projectName)}`;
    const projectJson = await fetchJSON(`${projectDir}/project.json`);
    if (!projectJson) return null;

    const projectType: 'scad' | 'static' = projectJson.type === 'static' ? 'static' : 'scad';
    const entry = typeof projectJson.entry === 'string' && projectJson.entry.length > 0
      ? projectJson.entry
      : (projectType === 'scad' ? 'main.scad' : null);
    if (!entry) return null;

    const specifiedImage = projectJson.image || projectJson.thumbnail;
    const imageUrl = specifiedImage && typeof specifiedImage === 'string'
      ? `${projectDir}/${encodeURIComponent(specifiedImage)}`
      : undefined;

    return {
      id: projectName,
      title: projectJson.title ?? projectName,
      description: projectJson.description,
      category: projectJson.category,
      tags: projectJson.tags,
      author: projectJson.author,
      entry,
      entryPath: `${MODELS_BASE_PATH}/${projectName}/${entry}`,
      type: projectType,
      image: imageUrl,
      status: projectJson.status,
      hidden: projectJson.hidden === true,
    } as BrowserProject;
  }));

  return results
    .filter((p): p is BrowserProject => p !== null && !p.hidden)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function loadProjects(): Promise<BrowserProject[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = collectFromManifest()
    .then((projects) => {
      cache = projects;
      return projects;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

// Fire-and-forget warm-up; safe to call multiple times.
export function preloadProjects(): void {
  loadProjects().catch(() => { /* warmed lazily on demand */ });
}
