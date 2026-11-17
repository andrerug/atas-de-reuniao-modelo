// uso: npx tsx scripts/extrair.ts arquivo.pdf  (só para conferir a leitura de texto)
import fs from 'fs';
import { extrairTexto } from '../server/documentos';
const f = process.argv[2];
console.log(await extrairTexto(fs.readFileSync(f), f));
