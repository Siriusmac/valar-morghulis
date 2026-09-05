import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
})
