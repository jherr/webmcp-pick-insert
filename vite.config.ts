import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

// COOP/COEP are not required by the official playground WASM (no threads).
// Setting `require-corp` would block the WebMCP relay's CDN-served embed
// script, so we leave headers unset.

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  worker: {
    format: 'es',
  },
  // Official OpenSCAD playground build (~9MB wasm + emscripten glue).
  assetsInclude: ['**/*.wasm'],
  plugins: [
    nitro(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
