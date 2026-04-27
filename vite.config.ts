import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: process.env.GITHUB_REPOSITORY?.toLowerCase().endsWith('/pos') ? '/pos/' : '/',
  plugins: [vue()],
})
