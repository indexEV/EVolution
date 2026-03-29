import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/EVolution/', // matches your GitHub repo folder
  build: {
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'react-vendor';
          if (id.includes('node_modules/@pkmn')) return 'pkmn-vendor';
          if (id.includes('node_modules/@smogon/calc')) return 'smogon-calc';
        },
      },
    },
  },
})
