import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({base:'/Choirloom/',plugins:[react()],server:{port:5173,proxy:{'/Choirloom/api':{target:'http://127.0.0.1:8787',ws:true,rewrite:path=>path.replace('/Choirloom','')}}}});
