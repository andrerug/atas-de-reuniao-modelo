// Empacota o server.ts num arquivo só (dist-server/server.mjs), sem precisar de node_modules em produção.
import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  outfile: 'dist-server/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: false,
  sourcemap: false,
  // vite só é usado em desenvolvimento; bufferutil/utf-8-validate são opcionais do ws
  external: ['vite', 'bufferutil', 'utf-8-validate'],
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
