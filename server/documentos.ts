/** Leitura de PDF e .docx em texto simples. */
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

export async function extrairTexto(buf: Buffer, nome: string): Promise<string> {
  const ext = nome.toLowerCase().split('.').pop();
  if (ext === 'docx') {
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value;
  }
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).join('\n');
}
