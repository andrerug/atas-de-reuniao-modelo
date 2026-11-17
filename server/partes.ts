/**
 * Áudios longos (aulas de 4 a 5 horas).
 *
 * O navegador manda o arquivo inteiro uma vez; aqui o ffmpeg converte para
 * MP3 mono leve e corta em partes de PARTE_MIN minutos (15 por padrão).
 * Depois o navegador pede a transcrição de cada parte, 5 de cada vez, e no
 * fim as partes viram trechos com o tempo certo da aula inteira.
 */
import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Request } from 'express';

export const PARTE_SEG = Math.max(60, Number(process.env.PARTE_MIN || 15) * 60);
const PASTA = path.resolve(process.env.PARTES_DIR || path.join(os.tmpdir(), 'atas-partes'));
const TAMANHO_MAX = Number(process.env.AUDIO_MAX_MB || 2048) * 1024 * 1024;
const VALIDADE_MS = 8 * 60 * 60 * 1000;

export class ErroPartes extends Error {
  status: number;
  constructor(mensagem: string, status = 500) {
    super(mensagem);
    this.status = status;
  }
}

interface Trabalho {
  dono: string;
  criado: number;
  duracaoSeg: number;
  partes: { n: number; inicioSeg: number; fimSeg: number; arquivo: string }[];
}
const trabalhos = new Map<string, Trabalho>();

// limpa sobras de um reinício e o que ficou esquecido
fsp.rm(PASTA, { recursive: true, force: true }).catch(() => {});
setInterval(() => {
  const agora = Date.now();
  for (const [id, t] of trabalhos) if (agora - t.criado > VALIDADE_MS) apagarTrabalho(id).catch(() => {});
}, 30 * 60 * 1000).unref();

function rodar(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let saida = '';
    let erro = '';
    let p;
    try {
      p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return reject(e);
    }
    p.stdout.on('data', (d) => (saida += d));
    p.stderr.on('data', (d) => (erro = (erro + d).slice(-4000)));
    p.on('error', (e: any) => reject(e?.code === 'ENOENT' ? new ErroPartes('SEM_FFMPEG', 501) : e));
    p.on('close', (c) => (c === 0 ? resolve(saida) : reject(new Error(`${cmd} saiu com ${c}: ${erro.slice(-600)}`))));
  });
}

/** Recebe o arquivo (corpo cru da requisição), corta e devolve as partes. */
export async function receberECortar(req: Request, dono: string) {
  const id = crypto.randomBytes(12).toString('hex');
  const dir = path.join(PASTA, id);
  await fsp.mkdir(dir, { recursive: true });
  const original = path.join(dir, 'original');

  try {
    await new Promise<void>((resolve, reject) => {
      let recebidos = 0;
      const destino = fs.createWriteStream(original);
      req.on('data', (b: Buffer) => {
        recebidos += b.length;
        if (recebidos > TAMANHO_MAX) {
          req.unpipe(destino);
          destino.destroy();
          reject(new ErroPartes(`O arquivo passou de ${Math.round(TAMANHO_MAX / 1024 / 1024)} MB.`, 413));
          req.resume();
        }
      });
      req.on('aborted', () => reject(new ErroPartes('O envio foi interrompido.', 400)));
      destino.on('error', reject);
      destino.on('finish', () => resolve());
      req.pipe(destino);
    });

    const info = await rodar('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', original]);
    const duracaoSeg = Number(String(info).trim()) || 0;
    if (!duracaoSeg) throw new ErroPartes('Não consegui ler a duração deste arquivo. Confira se é um áudio ou vídeo válido.', 400);

    // MP3 mono 16 kHz a 32 kbps: 15 min ficam com uns 3,6 MB
    await rodar('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-i', original,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k',
      '-f', 'segment', '-segment_time', String(PARTE_SEG), '-reset_timestamps', '1',
      path.join(dir, 'parte_%03d.mp3'),
    ]);
    await fsp.rm(original, { force: true });

    const arquivos = (await fsp.readdir(dir)).filter((f) => /^parte_\d+\.mp3$/.test(f)).sort();
    if (!arquivos.length) throw new ErroPartes('O corte do áudio não gerou nenhuma parte.', 500);
    const partes = arquivos
      .map((arquivo, i) => ({
        n: i + 1,
        inicioSeg: i * PARTE_SEG,
        fimSeg: Math.min(duracaoSeg, (i + 1) * PARTE_SEG),
        arquivo: path.join(dir, arquivo),
      }))
      // o corte às vezes deixa uma sobra de menos de 1 segundo no fim
      .filter((p, i) => i === 0 || p.fimSeg - p.inicioSeg >= 3);
    trabalhos.set(id, { dono, criado: Date.now(), duracaoSeg, partes });
    return { trabalho: id, duracaoSeg, partes: partes.map(({ arquivo, ...p }) => p) };
  } catch (e) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/** Áudio de uma parte em base64, só para quem enviou. */
export async function lerParte(id: string, n: number, dono: string) {
  const t = trabalhos.get(String(id));
  if (!t || t.dono !== dono) throw new ErroPartes('Este áudio não está mais no servidor. Envie o arquivo de novo.', 410);
  const p = t.partes.find((x) => x.n === Number(n));
  if (!p) throw new ErroPartes(`A parte ${n} não existe.`, 400);
  return { base64: (await fsp.readFile(p.arquivo)).toString('base64'), mimeType: 'audio/mp3', ...p, total: t.partes.length };
}

/** Junta as partes num MP3 só e grava em `destino` (a gravação fica guardada com a ata). */
export async function guardarAudio(id: string, dono: string, destino: string) {
  const t = trabalhos.get(String(id));
  if (!t || t.dono !== dono) throw new ErroPartes('Este áudio não está mais no servidor.', 410);
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  const lista = path.join(PASTA, String(id), 'lista.txt');
  // caminhos no formato do ffmpeg (barras normais; aspas simples escapadas)
  const linha = (f: string) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
  await fsp.writeFile(lista, t.partes.map((p) => linha(p.arquivo)).join('\n'));
  await rodar('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', destino]);
  return { duracaoSeg: t.duracaoSeg };
}

export async function apagarTrabalho(id: string, dono?: string) {
  const t = trabalhos.get(String(id));
  if (!t || (dono && t.dono !== dono)) return;
  trabalhos.delete(String(id));
  await fsp.rm(path.join(PASTA, String(id)), { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Juntar as partes em trechos com o tempo da aula inteira
// ---------------------------------------------------------------------------

export function hms(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dois = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${dois(h)}:${dois(m)}:${dois(r)}` : `${dois(m)}:${dois(r)}`;
}

function paraSeg(t: string): number {
  const p = t.split(':').map((x) => parseInt(x, 10) || 0);
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
}

export interface Segmento {
  id: number;
  startTime: string;
  endTime: string;
  speaker: string;
  text: string;
  topic?: string;
  _ini: number;
}

/**
 * Lê linhas no formato "[mm:ss] Falante: texto" (tempo relativo à parte) e
 * soma o início da parte. Linhas sem tempo continuam o trecho anterior.
 */
export function montarSegmentos(partes: { inicioSeg: number; fimSeg: number; texto: string }[]): Segmento[] {
  const segs: Segmento[] = [];
  const linhaTempo = /^\s*[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*[-–—]?\s*(?:\*\*)?([^:\n]{1,40}?)(?:\*\*)?:\s*(.*)$/;
  const soTempo = /^\s*[\[(]?(\d{1,2}:\d{2}(?::\d{2})?)[\])]?\s*[-–—]?\s*(.*)$/;

  for (const parte of partes) {
    const daParte: Segmento[] = [];
    for (const bruta of String(parte.texto || '').split(/\r?\n/)) {
      const linha = bruta.trim();
      if (!linha) continue;
      let m = linha.match(linhaTempo);
      let tempo: string | null = null;
      let falante = '';
      let texto = '';
      if (m && !/^\d+$/.test(m[2].trim())) {
        tempo = m[1];
        falante = m[2].trim();
        texto = m[3];
      } else if ((m = linha.match(soTempo))) {
        tempo = m[1];
        texto = m[2];
      }
      if (tempo !== null) {
        const rel = Math.min(paraSeg(tempo), Math.max(0, parte.fimSeg - parte.inicioSeg));
        daParte.push({ id: 0, startTime: '', endTime: '', speaker: falante || 'Professor', text: texto.trim(), _ini: parte.inicioSeg + rel });
      } else if (daParte.length) {
        daParte[daParte.length - 1].text += ' ' + linha;
      } else {
        daParte.push({ id: 0, startTime: '', endTime: '', speaker: 'Professor', text: linha, _ini: parte.inicioSeg });
      }
    }
    // garante a ordem dentro da parte
    let ultimo = parte.inicioSeg;
    for (const s of daParte) {
      if (s._ini < ultimo) s._ini = ultimo;
      ultimo = s._ini;
    }
    segs.push(...daParte.filter((s) => s.text.trim()));
  }

  segs.forEach((s, i) => {
    s.id = i + 1;
    s.startTime = hms(s._ini);
    const prox = segs[i + 1];
    const fimParte = partes.find((p) => s._ini >= p.inicioSeg && s._ini < p.fimSeg)?.fimSeg ?? s._ini;
    s.endTime = hms(prox ? Math.min(prox._ini, fimParte) : fimParte);
  });
  return segs;
}

/** Texto corrido com o tempo absoluto, para a IA ler e para a "transcrição bruta". */
export function textoComTempo(segs: Segmento[]): string {
  return segs.map((s) => `[${s.startTime}] ${s.speaker}: ${s.text}`).join('\n');
}

/** Põe o tópico da linha do tempo em cada trecho. */
export function aplicarTopicos(segs: Segmento[], topicos: any[]) {
  const lista = (Array.isArray(topicos) ? topicos : [])
    .map((t) => ({ ini: paraSeg(String(t?.timestamp || '0:00')), titulo: String(t?.title || '') }))
    .filter((t) => t.titulo)
    .sort((a, b) => a.ini - b.ini);
  for (const s of segs) {
    let atual = '';
    for (const t of lista) if (t.ini <= s._ini) atual = t.titulo;
    if (atual) s.topic = atual;
  }
}
