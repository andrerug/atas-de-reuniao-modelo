/**
 * Chamadas de IA com escolha da chave e registro do custo.
 *
 * - Admin: sempre a chave do laboratório (Gemini), sem limite.
 * - Aluno: chave do laboratório enquanto houver crédito; depois, a chave
 *   própria do OpenRouter (cadastrada em seu-dominio.exemplo/conta), com o modelo
 *   que ele escolheu. Sem crédito e sem chave, a chamada é recusada (402).
 * - Cada chamada grava no histórico: ação, chave usada, modelo e custo.
 */
import { GoogleGenAI } from '@google/genai';
import {
  CONTAS_ATIVAS,
  ENDERECO_CONTA,
  Perfil,
  chaveOpenRouter,
  precoDo,
  registrarUso,
  saldo,
} from './contas';

export type Provedor =
  | { tipo: 'laboratorio' }
  | { tipo: 'openrouter'; chave: string; modelo: string };

export interface Contexto {
  perfil: Perfil | null; // null = modo antigo, sem contas
  provedor: Provedor;
}

export class ErroIA extends Error {
  status: number;
  constructor(mensagem: string, status = 500) {
    super(mensagem);
    this.status = status;
  }
}

const MODELO_OPENROUTER_PADRAO = process.env.MODELO_OPENROUTER_PADRAO || 'google/gemini-2.5-flash';

/** Decide qual chave paga esta chamada. */
export async function escolherProvedor(perfil: Perfil | null, opcoes: { aceitaOpenRouter?: boolean } = {}): Promise<Provedor> {
  if (!perfil || perfil.papel === 'admin') return { tipo: 'laboratorio' };
  if ((await saldo(perfil.id)) > 0.0005) return { tipo: 'laboratorio' };
  if (opcoes.aceitaOpenRouter === false) {
    throw new ErroIA(
      'Seu crédito do laboratório acabou, e a conversa por voz só funciona com ele. As outras funções continuam com a sua chave do OpenRouter.',
      402
    );
  }
  if (perfil.tem_chave_openrouter) {
    const chave = await chaveOpenRouter(perfil.id);
    if (chave) return { tipo: 'openrouter', chave, modelo: perfil.modelo_openrouter || MODELO_OPENROUTER_PADRAO };
  }
  throw new ErroIA(
    `Seu crédito do laboratório acabou. Para continuar, cadastre a sua chave do OpenRouter em ${ENDERECO_CONTA}`,
    402
  );
}

// ---------------------------------------------------------------------------
// Gemini (chave do laboratório)
// ---------------------------------------------------------------------------

function clienteGemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('CHAVE_AUSENTE');
  return new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
}

export function lista(env: string | undefined, padrao: string): string[] {
  return (env || padrao)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}
const MODELOS_TRANSCRICAO = lista(process.env.MODELOS_TRANSCRICAO, 'gemini-3.5-transcribe,gemini-3.8-flash,gemini-flash-latest');
const MODELOS_TEXTO = lista(process.env.MODELOS_TEXTO, 'gemini-3.8-flash,gemini-flash-latest');
// Partes de aula longa: precisa de um modelo que siga o formato "[mm:ss] Falante: texto".
// O gemini-3.5-transcribe não marca tempo, por isso fica só de reserva.
const MODELOS_PARTES = lista(process.env.MODELOS_PARTES, 'gemini-3.8-flash,gemini-flash-latest,gemini-3.5-transcribe');

/** Texto da resposta, incluindo o que o modelo de transcrição devolve à parte (audioTranscription). */
function textoDaResposta(r: any): string {
  const direto = (r?.text || '').trim();
  if (direto) return direto;
  const partes = r?.candidates?.[0]?.content?.parts || [];
  return partes
    .map((p: any) => p?.text || p?.audioTranscription?.text || '')
    .join('')
    .trim();
}

async function custoGemini(modelo: string, uso: any): Promise<number> {
  if (!uso) return 0;
  const p = await precoDo(modelo);
  let audio = 0;
  let texto = 0;
  for (const d of uso.promptTokensDetails || []) {
    if (String(d.modality).toUpperCase() === 'AUDIO') audio += d.tokenCount || 0;
    else texto += d.tokenCount || 0;
  }
  if (!audio && !texto) texto = uso.promptTokenCount || 0;
  const saida = (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0);
  return (texto * p.entrada_texto_usd_m + audio * p.entrada_audio_usd_m + saida * p.saida_usd_m) / 1_000_000;
}

async function geminiComReserva(
  modelos: string[],
  contents: any,
  config?: any
): Promise<{ texto: string; modelo: string; custo: number; tokens: any }> {
  const ai = clienteGemini();
  let ultimo: any = null;
  for (const modelo of modelos) {
    try {
      // raciocínio baixo nos modelos 3.x: transcrever não precisa pensar, e assim sai mais rápido e barato
      const cfg = config?.raciocinioBaixo
        ? { ...config, raciocinioBaixo: undefined, ...(/^gemini-3\.\d+-(flash|pro)/.test(modelo) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}) }
        : config;
      const r = await ai.models.generateContent({ model: modelo, contents, config: cfg });
      const texto = textoDaResposta(r);
      if (!texto) throw new Error('resposta vazia');
      return { texto, modelo, custo: await custoGemini(modelo, r.usageMetadata), tokens: r.usageMetadata };
    } catch (e: any) {
      ultimo = e;
      console.warn(`Modelo ${modelo} falhou (${String(e?.message || e).slice(0, 120)}). Tentando o próximo.`);
    }
  }
  throw ultimo || new Error('Nenhum modelo disponível.');
}

// ---------------------------------------------------------------------------
// OpenRouter (chave do aluno)
// ---------------------------------------------------------------------------

function formatoAudio(mime: string): string | null {
  const m = (mime || '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  if (m.includes('aac')) return 'aac';
  if (m.includes('m4a') || m.includes('mp4')) return 'm4a';
  if (m.includes('aiff')) return 'aiff';
  return null; // webm não é aceito: o navegador converte para wav antes
}

async function openRouter(
  p: { chave: string; modelo: string },
  sistema: string,
  partes: any[],
  json: boolean
): Promise<{ texto: string; modelo: string; custo: number }> {
  let r: Response;
  try {
    r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${p.chave}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://atas.seu-dominio.exemplo',
        'X-Title': 'Atas de Reuniao',
      },
      body: JSON.stringify({
        model: p.modelo,
        messages: [
          ...(sistema ? [{ role: 'system', content: sistema }] : []),
          { role: 'user', content: partes },
        ],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        usage: { include: true },
      }),
    });
  } catch {
    throw new ErroIA('Não foi possível falar com o OpenRouter. Tente de novo.', 502);
  }
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) {
    const msg = String(d?.error?.message || '');
    if (r.status === 401) throw new ErroIA(`O OpenRouter recusou a sua chave. Confira ou cadastre outra em ${ENDERECO_CONTA}`, 402);
    if (r.status === 402) throw new ErroIA('A sua conta no OpenRouter está sem crédito. Recarregue em openrouter.ai/credits.', 402);
    if (/audio|input_audio|modalit/i.test(msg)) {
      throw new ErroIA(`O modelo ${p.modelo} não aceita áudio. Escolha um que aceite (ex.: google/gemini-2.5-flash) em ${ENDERECO_CONTA}`, 400);
    }
    if (r.status === 404 || /not a valid model|No endpoints/i.test(msg)) {
      throw new ErroIA(`O modelo ${p.modelo} não existe no OpenRouter. Troque em ${ENDERECO_CONTA}`, 400);
    }
    if (r.status === 429) throw new ErroIA('O OpenRouter limitou as chamadas. Espere um minuto e tente de novo.', 429);
    throw new ErroIA(`O OpenRouter respondeu com erro: ${msg.slice(0, 200) || r.status}`, 502);
  }
  const texto = String(d?.choices?.[0]?.message?.content || '').trim();
  return { texto, modelo: d?.model || p.modelo, custo: Number(d?.usage?.cost || 0) };
}

// ---------------------------------------------------------------------------
// O que os endpoints usam
// ---------------------------------------------------------------------------

async function registrar(ctx: Contexto, acao: string, r: { modelo: string; custo: number }, detalhes?: unknown) {
  if (!CONTAS_ATIVAS || !ctx.perfil) return;
  await registrarUso(ctx.perfil.id, {
    acao,
    provedor: ctx.provedor.tipo,
    modelo: r.modelo,
    custo_usd: r.custo,
    detalhes,
  });
}

/** Transcreve um áudio (base64). */
export async function transcrever(
  ctx: Contexto,
  audioBase64: string,
  mime: string,
  instrucao: string,
  acao: string,
  opcoes: { parteComTempo?: boolean } = {}
): Promise<{ texto: string; modelo: string }> {
  let r: { texto: string; modelo: string; custo: number };
  if (ctx.provedor.tipo === 'openrouter') {
    const formato = formatoAudio(mime);
    if (!formato) throw new ErroIA('Este formato de áudio não vai para o OpenRouter. Envie MP3, M4A, WAV, OGG ou FLAC.', 400);
    r = await openRouter(ctx.provedor, '', [
      { type: 'text', text: instrucao },
      { type: 'input_audio', input_audio: { data: audioBase64, format: formato } },
    ], false);
  } else {
    const g = await geminiComReserva(
      opcoes.parteComTempo ? MODELOS_PARTES : MODELOS_TRANSCRICAO,
      { parts: [{ inlineData: { mimeType: mime, data: audioBase64 } }, { text: instrucao }] },
      opcoes.parteComTempo ? { raciocinioBaixo: true } : undefined
    );
    r = g;
  }
  await registrar(ctx, acao, r, { tamanho_kb: Math.round((audioBase64.length * 0.75) / 1024) });
  return { texto: r.texto, modelo: r.modelo };
}

/** Gera texto (organizar a aula em JSON, responder dúvida). */
export async function gerarTexto(
  ctx: Contexto,
  sistema: string,
  pedido: string,
  json: boolean,
  acao: string
): Promise<{ texto: string; modelo: string }> {
  let r: { texto: string; modelo: string; custo: number };
  if (ctx.provedor.tipo === 'openrouter') {
    r = await openRouter(ctx.provedor, sistema, [{ type: 'text', text: pedido }], json);
  } else {
    r = await geminiComReserva(MODELOS_TEXTO, pedido, {
      systemInstruction: sistema,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    });
  }
  await registrar(ctx, acao, r, { caracteres: pedido.length });
  return { texto: r.texto, modelo: r.modelo };
}

/** Registra o custo de uma conversa por voz quando ela termina. */
export async function registrarVoz(ctx: Contexto, modelo: string, segundos: number, tokens: { entrada: number; saida: number }) {
  const p = await precoDo(modelo);
  let custo = (tokens.entrada * p.entrada_audio_usd_m + tokens.saida * p.saida_usd_m) / 1_000_000;
  if (!custo) custo = (segundos / 60) * 0.03; // estimativa quando o Gemini não informa os tokens
  await registrar(ctx, `conversa por voz (${Math.max(1, Math.round(segundos / 60))} min)`, { modelo, custo }, { segundos, tokens });
}
