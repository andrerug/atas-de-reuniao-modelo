// Empacota o conector MCP num arquivo só (mcp/dist/atas-mcp.mjs), que roda com `node` sem node_modules.
import { build } from 'esbuild';

await build({
  entryPoints: ['mcp/servidor.ts'],
  outfile: 'mcp/dist/atas-mcp.mjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
