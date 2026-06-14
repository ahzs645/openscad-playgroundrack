// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React from 'react';
import { createRoot } from 'react-dom/client';
import PrimeReact from 'primereact/api';
import {App} from './components/App.tsx';
import { createEditorFS } from './fs/filesystem.ts';
import {readStateFromFragment} from './state/fragment-state.ts'
import { createInitialState, defaultSourcePath } from './state/initial-state.ts';
import defaultScad from './state/default-scad.ts';
import { preloadProjects } from './state/projects-loader.ts';
import './index.css';

// Warm the gallery cache in parallel with the FS mount so the landing
// page paints with project tiles immediately.
preloadProjects();

import debug from 'debug';
import { isInStandaloneMode, registerCustomAppHeightCSSProperty } from './utils.ts';
import { State, StatePersister } from './state/app-state.ts';
import { writeStateInFragment } from "./state/fragment-state.ts";

import "primereact/resources/themes/lara-light-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.min.css";

const nodeEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV) ? process.env.NODE_ENV : 'production';
const currentCommit = import.meta.env.VITE_COMMIT_SHA || '';

PrimeReact.hideOverlaysOnDocumentScrolling = false;

const log = debug('app:log');

function initialHashNeedsFullLibraryMount() {
  if (typeof window === 'undefined') {
    return false;
  }
  const hash = window.location.hash;
  if (!hash.startsWith('#path=')) {
    return false;
  }
  const path = decodeURIComponent(hash.substring('#path='.length));
  return path.startsWith('/libraries/');
}

function getVersionUrl() {
  return new URL('version.json', window.location.href).toString();
}

function showUpdatePrompt(onRefresh: () => void) {
  if (typeof document === 'undefined' || document.getElementById('app-update-prompt')) {
    return;
  }

  const prompt = document.createElement('div');
  prompt.id = 'app-update-prompt';
  prompt.className = 'app-update-prompt';
  prompt.setAttribute('role', 'status');
  prompt.innerHTML = `
    <span>New version available</span>
    <button type="button">Refresh</button>
  `;

  const button = prompt.querySelector('button');
  button?.addEventListener('click', onRefresh);
  document.body.appendChild(prompt);
}

async function clearServiceWorkerCaches() {
  if (!('caches' in window)) {
    return;
  }
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

function startVersionChecker() {
  if (nodeEnv !== 'production' || !currentCommit || typeof window === 'undefined') {
    return;
  }

  const checkForUpdate = async () => {
    try {
      const response = await fetch(`${getVersionUrl()}?ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        return;
      }
      const latest = await response.json() as { commit?: string };
      if (latest.commit && latest.commit !== currentCommit) {
        showUpdatePrompt(async () => {
          await clearServiceWorkerCaches();
          window.location.reload();
        });
      }
    } catch (error) {
      console.warn('Could not check deployed version.', error);
    }
  };

  window.setTimeout(checkForUpdate, 5_000);
  window.setInterval(checkForUpdate, 60_000);
}

if (nodeEnv !== 'production') {
  debug.enable('*');
  log('Logging is enabled!');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => {
        registrations.forEach(registration => {
          if (registration.scope.startsWith(window.location.origin)) {
            registration.unregister().catch((error) => {
              console.warn('Failed to unregister service worker in development mode.', error);
            });
          }
        });
      })
      .catch((error) => {
        console.warn('Failed to enumerate service workers in development mode.', error);
      });
  }
} else {
  debug.disable();
  startVersionChecker();
}

declare var BrowserFS: BrowserFSInterface

async function bootstrap() {
  registerCustomAppHeightCSSProperty();

  const computeDefaultEditorEnabled = () => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host.endsWith('github.io')) {
        return false;
      }
    }
    return true;
  };

  const editorEnabled = (() => {
    const getEnvValue = (key: string) =>
      (typeof process !== 'undefined' && process.env?.[key]) ? String(process.env[key]) : '';

    const defaultEnabled = computeDefaultEditorEnabled();

    if (typeof window === 'undefined') {
      const envValue = getEnvValue('PLAYGROUND_EDITOR_ENABLED').toLowerCase();
      if (envValue) {
        return !['0', 'false', 'off', 'no'].includes(envValue);
      }
      return defaultEnabled;
    }
    const globalConfig = window.OPENSCAD_PLAYGROUND_CONFIG ?? {};
    let enabled = typeof globalConfig.editor === 'boolean' ? globalConfig.editor : defaultEnabled;

    const envValue = getEnvValue('PLAYGROUND_EDITOR_ENABLED').toLowerCase();
    if (envValue) {
      enabled = !['0', 'false', 'off', 'no'].includes(envValue);
    }

    const params = new URLSearchParams(window.location.search);
    const param = params.get('editor');
    if (param) {
      const normalized = param.toLowerCase();
      enabled = !['0', 'false', 'off', 'no'].includes(normalized);
    }
    return enabled;
  })();

  // Disable URL state persistence for now to keep links clean.
  const urlStateEnabled = false;

  // Only load critical archives upfront - others will be loaded by OpenSCAD worker when needed
  const { fs } = await createEditorFS({
    prefix: '/libraries/',
    allowPersistence: isInStandaloneMode(),
    onlyMountCritical: !initialHashNeedsFullLibraryMount(),
  });

  const seedDefaultSource = () => {
    try {
      const bfs = fs as any;
      if (typeof bfs?.existsSync === 'function' && bfs.existsSync(defaultSourcePath)) {
        return;
      }
      bfs.writeFileSync(defaultSourcePath, defaultScad, 'utf-8');
    } catch (error) {
      console.warn('Failed to seed default OpenSCAD source file.', error);
    }
  };

  seedDefaultSource();

  let statePersister: StatePersister;
  let persistedState: State | null = null;
  let shouldClearInitialHash = false;

  if (!editorEnabled) {
    statePersister = {
      set: async () => {},
    };
  } else if (isInStandaloneMode()) {
    const fs: FS = BrowserFS.BFSRequire('fs')
    try {
      const data = JSON.parse(new TextDecoder("utf-8").decode(fs.readFileSync('/state.json')));
      const {view, params} = data
      persistedState = {view, params};
    } catch (e) {
      console.log('Failed to read the persisted state from local storage.', e)
    }
    statePersister = {
      set: async ({view, params}) => {
        fs.writeFile('/state.json', JSON.stringify({view, params}));
      }
    };
  } else {
    persistedState = await readStateFromFragment();
    if (urlStateEnabled) {
      statePersister = {
        set: writeStateInFragment,
      };
    } else {
      statePersister = {
        set: async () => {},
      };
      if (typeof window !== 'undefined' && typeof history !== 'undefined') {
        shouldClearInitialHash = window.location.hash.length > 1;
      }
    }
  }

  const initialState = createInitialState(editorEnabled ? persistedState : null);

  const root = createRoot(
    document.getElementById('root') as HTMLElement
  );
  root.render(
    <React.StrictMode>
      <App initialState={initialState} statePersister={statePersister} fs={fs} />
    </React.StrictMode>
  );

  if (shouldClearInitialHash) {
    window.setTimeout(() => {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }, 0);
  }
}

// Start bootstrapping as soon as the DOM is ready, without waiting for all resources
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootstrap().catch(err => {
      console.error('Failed to bootstrap OpenSCAD Playground.', err);
    });
  });
} else {
  bootstrap().catch(err => {
    console.error('Failed to bootstrap OpenSCAD Playground.', err);
  });
}

// Keep service worker registration on window load so it does not block initial interactivity
window.addEventListener('load', async () => {
  //*
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (nodeEnv === 'production' && !isLocalhost) {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('ServiceWorker registration successful with scope: ', registration.scope);

            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdatePrompt(async () => {
                      await clearServiceWorkerCaches();
                      window.location.reload();
                    });
                  }
                };
              }
            };
        } catch (err) {
            console.log('ServiceWorker registration failed: ', err);
        }
    }
  }
  //*/
});
