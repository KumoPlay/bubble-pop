import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// The toy is served from https://kumoplay.github.io/bubble-pop/,
// so every asset path must start with /bubble-pop/.
const base = '/bubble-pop/';

export default defineConfig({
  base,
  plugins: [
    // Makes the toy installable ("Add to Home Screen") and playable offline after the first visit.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // src/platform/pwa.ts registers it and updates quietly when the toy is hidden
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bubble Pop',
        short_name: 'Bubble Pop',
        description: 'A cozy pocket fidget toy: pop bubble wrap, blow soap bubbles, squish a cloud. A KumoPlay game.',
        lang: 'en',
        // Only this toy's part of kumoplay.github.io: other KumoPlay games keep their own.
        id: base,
        start_url: base,
        scope: base,
        // Full screen on Android; iPhone uses its home-screen mode (with the clock still showing).
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#FDE3EC',
        theme_color: '#FDE3EC',
        categories: ['games', 'kids', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache names start with the toy's name, so they never mix with another KumoPlay game's.
        cacheId: 'bubble-pop',
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'assets/nunito-latin-wght-normal-*.woff2'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2020',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
