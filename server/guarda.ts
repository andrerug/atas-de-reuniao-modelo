/**
 * Onde ficam as atas, a configuração (lista de conselheiros, secretário) e os arquivos enviados.
 * - Modo contas: registros na tabela conteudos do Supabase (app = 'atas'), por pessoa.
 * - Modo local (desenvolvimento): um JSON na pasta de dados.
 * Os arquivos (pauta, pareceres, gravação, brasão) ficam em ARQUIVOS_DIR/<pessoa>/<ata>/.
 */
import crypto from 'crypto';
import fsp from 'fs/promises';
import path from 'path';
import { CONTAS_ATIVAS, salvarConteudo, listarConteudos, lerConteudo, apagarConteudo } from './contas';

const DADOS = path.resolve(process.env.DADOS_DIR || path.join(process.cwd(), 'dados-local'));
export const ARQUIVOS = path.resolve(process.env.ARQUIVOS_DIR || path.join(DADOS, 'arquivos'));
const ARQ_LOCAL = path.join(DADOS, 'conteudos.json');

export interface Registro {
  id: string;
  tipo: string;
  titulo: string;
  dados: any;
  atualizado_em: string;
}

const ID_OK = /^[0-9a-zA-Z-]{8,64}$/;
export const idValido = (id: string) => ID_OK.test(id);

async function lerLocal(): Promise<Registro[]> {
  try {
    return JSON.parse(await fsp.readFile(ARQ_LOCAL, 'utf-8'));
  } catch {
    return [];
  }
}
async function gravarLocal(l: Registro[]) {
  await fsp.mkdir(DADOS, { recursive: true });
  await fsp.writeFile(ARQ_LOCAL, JSON.stringify(l));
}

export async function salvar(uid: string | null, r: { id?: string | null; tipo: string; titulo: string; dados: any }): Promise<string> {
  if (CONTAS_ATIVAS && uid) {
    return salvarConteudo(uid, { id: r.id, titulo: r.titulo, dados: r.dados, texto_md: '', tipo: r.tipo });
  }
  const l = await lerLocal();
  const agora = new Date().toISOString();
  const i = r.id ? l.findIndex((x) => x.id === r.id) : -1;
  if (i >= 0) {
    l[i] = { ...l[i], titulo: r.titulo, dados: r.dados, atualizado_em: agora };
    await gravarLocal(l);
    return l[i].id;
  }
  const id = crypto.randomUUID();
  l.push({ id, tipo: r.tipo, titulo: r.titulo, dados: r.dados, atualizado_em: agora });
  await gravarLocal(l);
  return id;
}

export async function listar(uid: string | null, tipo: string) {
  if (CONTAS_ATIVAS && uid) {
    return (await listarConteudos(uid)).filter((x: any) => x.tipo === tipo);
  }
  return (await lerLocal())
    .filter((x) => x.tipo === tipo)
    .map(({ dados, ...x }) => x)
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
}

export async function ler(uid: string | null, id: string): Promise<{ titulo: string; dados: any } | null> {
  if (!idValido(id)) return null;
  if (CONTAS_ATIVAS && uid) return lerConteudo(uid, id);
  return (await lerLocal()).find((x) => x.id === id) || null;
}

export async function apagar(uid: string | null, id: string) {
  if (!idValido(id)) return;
  if (CONTAS_ATIVAS && uid) await apagarConteudo(uid, id);
  else await gravarLocal((await lerLocal()).filter((x) => x.id !== id));
  await fsp.rm(pastaDe(uid, id), { recursive: true, force: true });
}

/** Configuração da pessoa (um registro só, tipo 'config'). */
export async function lerConfig(uid: string | null): Promise<{ id: string | null; dados: any }> {
  const l = await listar(uid, 'config');
  if (!l.length) return { id: null, dados: null };
  const r = await ler(uid, l[0].id);
  return { id: l[0].id, dados: r?.dados || null };
}

export function pastaDe(uid: string | null, ata: string) {
  const dono = crypto.createHash('sha256').update(uid || 'local').digest('hex').slice(0, 32);
  return path.join(ARQUIVOS, dono, ata);
}

export function nomeArquivo(nome: string): string {
  const base = path.basename(String(nome || 'arquivo'));
  const ext = (base.match(/\.(pdf|docx|mp3|png|jpe?g)$/i)?.[1] || 'bin').toLowerCase();
  const raiz = base
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_')
    .slice(0, 60) || 'arquivo';
  return `${raiz}.${ext}`;
}
