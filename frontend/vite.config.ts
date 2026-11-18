import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// A interface chama /api no próprio endereço, e o Vite repassa para a API. Assim o cookie de
// sessão é do mesmo site e nada precisa de CORS. Em produção, o mesmo papel é de um proxy
// reverso (ou da própria hospedagem) apontando /api para a API.
const api = { '/api': { target: process.env.API_URL ?? 'http://127.0.0.1:3333', changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: api },
  preview: { proxy: api },
});
