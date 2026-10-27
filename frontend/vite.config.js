import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo192.png', 'logo512.png'],
      manifest: {
        name: 'CIR Ganadero',
        short_name: 'CIR Ganadero',
        description: 'Gestion de fincas bovinas y porcinas',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0b3b21',
        background_color: '#f9faf6',
        icons: [
          {
            src: '/logo192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/logo512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp}'],
        globIgnores: ['**/assests/logo-romilio.png', '**/assests/mapa-potreros.png'],
        cleanupOutdatedCaches: true
      }
    })
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.js$/,
    exclude: []
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx'
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react-vendor';
          const normalizado = id.replace(/\\/g, '/');
          const pesado = normalizado.match(/\/src\/Components\/(Reportes|GestionConsolidacionPremium|IATF|ImportarExcel)\.js$/);
          if (pesado) return `vista-${pesado[1].toLowerCase()}`;
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
