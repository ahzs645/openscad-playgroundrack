import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const envKeys = [
  'PLAYGROUND_EDITOR_ENABLED',
  'PLAYGROUND_EDITOR_TOGGLE',
  'PLAYGROUND_CUSTOMIZER_OPEN',
  'PLAYGROUND_KANBAN_ENABLED',
  'PLAYGROUND_URL_STATE_ENABLED',
];

export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, process.cwd(), '');
  const nodeEnv = mode === 'production' ? 'production' : 'development';
  const env = Object.fromEntries(
    envKeys.map((key) => [key, loadedEnv[key] ?? process.env[key] ?? '']),
  );

  return {
    base: './',
    publicDir: 'public',
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          { src: 'Models', dest: '.' },
        ],
      }),
      VitePWA({
        strategies: 'generateSW',
        filename: 'sw.js',
        injectRegister: false,
        disable: mode !== 'production',
        workbox: {
          globPatterns: ['**/*'],
          maximumFileSizeToCacheInBytes: 200 * 1024 * 1024,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [{
            urlPattern: ({ url }) =>
              !url.pathname.endsWith('/version.json') &&
              !url.pathname.endsWith('/sw.js'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'all',
              expiration: {
                maxEntries: 1000,
                purgeOnQuotaError: true,
              },
            },
          }],
        },
      }),
    ],
    define: {
      'process.env': JSON.stringify({ NODE_ENV: nodeEnv, ...env }),
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
      'globalThis.process': JSON.stringify({}),
    },
    resolve: {
      alias: {
        'node:zlib': path.resolve('src/shims/empty.ts'),
      },
    },
    server: {
      port: 4000,
      strictPort: true,
      hmr: false,
    },
    optimizeDeps: {
      noDiscovery: true,
      entries: ['index.html'],
      include: [
        '@firstform/json-url',
        'blurhash',
        'chroma-js',
        'debug',
        'jszip',
        'prop-types',
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'thumbhash',
        'uzip',
        'uuid',
      ],
    },
    preview: {
      port: 4000,
      strictPort: true,
    },
    worker: {
      format: 'es',
    },
    build: {
      sourcemap: mode === 'production' ? 'hidden' : true,
    },
  };
});
