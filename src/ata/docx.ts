/** Gera o .docx da ata no navegador (Times New Roman 12, justificado, linhas numeradas). */
import {
  AlignmentType,
  Document,
  ImageRun,
  LineNumberRestartFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { AtaMontada } from './montar';

const FONTE = 'Times New Roman';
const cm = (v: number) => Math.round(v * 567);

export async function gerarDocx(m: AtaMontada, brasao?: { dados: ArrayBuffer; tipo: 'png' | 'jpg' }): Promise<Blob> {
  const filhos: Paragraph[] = [];

  if (brasao) {
    filhos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        suppressLineNumbers: true,
        spacing: { after: 120 },
        children: [new ImageRun({ type: brasao.tipo, data: brasao.dados, transformation: { width: 64, height: 72 } })],
      })
    );
  }
  m.cabecalho.forEach((linha) =>
    filhos.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        suppressLineNumbers: true,
        spacing: { after: 60 },
        children: [new TextRun({ text: linha, bold: true, font: FONTE, size: 24 })],
      })
    )
  );
  filhos.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      suppressLineNumbers: true,
      indent: { left: cm(7) },
      spacing: { before: 360, after: 240 },
      children: [new TextRun({ text: m.titulo, font: FONTE, size: 24 })],
    })
  );
  filhos.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { line: 276 },
      children: m.corpo.map((t) => new TextRun({ text: t.t, bold: t.b, font: FONTE, size: 24, highlight: t.falta ? 'yellow' : undefined })),
    })
  );

  const doc = new Document({
    creator: 'Atas de Reunião',
    title: m.titulo,
    styles: { default: { document: { run: { font: FONTE, size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: cm(2.5), bottom: cm(2), left: cm(3), right: cm(2), gutter: 0, header: cm(1.25), footer: cm(1.25) },
          },
          lineNumbers: { countBy: 1, restart: LineNumberRestartFormat.CONTINUOUS, distance: cm(0.5) },
        },
        children: filhos,
      },
    ],
  });
  return Packer.toBlob(doc);
}
