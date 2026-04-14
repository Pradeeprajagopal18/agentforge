import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = parseInt(env.VITE_FRONTEND_PORT || '5173', 10)

  return {
    plugins: [react()],
    server: {
      port: frontendPort,
      strictPort: false,   // fall back to next available port if taken
    },
  }
})
