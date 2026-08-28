/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    // The phone app is a separate project with its own runner (`mobile`, jest
    // under `jest-expo`). Without this, vitest picks its test files up by
    // their names alone and fails on the first `react-native` import.
    exclude: ['node_modules/**', 'dist/**', 'mobile/**'],
  },
});
