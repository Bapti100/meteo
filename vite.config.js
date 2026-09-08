import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Remplace "meteo-multimodele" par le nom exact de ton dépôt GitHub.
// Si ton dépôt s'appelle "<ton-user>.github.io", mets base: '/' à la place.
export default defineConfig({
  plugins: [react()],
  base: '/meteo/',
});