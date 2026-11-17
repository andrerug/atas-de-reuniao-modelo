/**
 * Conector MCP do app Atas de Reunião (atas.seu-dominio.exemplo).
 *
 * Roda no computador da pessoa (stdio) e fala com o app usando a chave gerada em
 * Configuração → "Chave para o Claude". Variáveis:
 *   ATAS_CHAVE  chave atas_... (obrigatória)
 *   ATAS_URL    endereço do app (padrão https://atas.seu-dominio.exemplo)
 *   ATAS_PASTA  pasta onde salvar o Word (padrão: Downloads)
 */
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ATA_NOVA, Ata, CONFIG_INICIAL, Config, ParteTranscrita, RESULTADOS, Resultado, itemVazio } from '../src/tipos';
import { montarAta, presentes, textoSimples } from '../src/ata/montar';
import { gerarDocx } from '../src/ata/docx';
import { PautaLida, ParecerLido, Redacao, acharItem, aplicarPauta, aplicarRedacao, assuntoDe, interessadoDe, nomeArquivoDocx, pedidoRedacao, presencaInicial } from '../src/ata/aplicar';
import { transcricaoCompleta } from '../src/utils/tempo';

const URL_APP = (process.env.ATAS_URL || 'https://atas.seu-dominio.exemplo').replace(/\/$/, '');
const CHAVE = process.env.ATAS_CHAVE || '';
const PASTA_SAIDA = process.env.ATAS_PASTA || path.join(os.homedir(), 'Downloads');

// ---------------------------------------------------------------------------
// Conversa com o app
// ---------------------------------------------------------------------------

class ErroApp extends Error {}

async function chamar<T = any>(caminho: string, opcoes: { method?: string; json?: unknown; corpo?: any; cabecalhos?: Record<string, string> } = {}): Promise<T> {
  if (!CHAVE) throw new ErroApp('Falta a chave. Gere em atas.seu-dominio.exemplo → Configuração → "Chave para o Claude" e coloque em ATAS_CHAVE.');
  const headers: Record<string, string> = { Authorization: `Bearer ${CHAVE}`, ...(opcoes.cabecalhos || {}) };
  let body: any = opcoes.corpo;
  if (opcoes.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opcoes.json);
  }
  let r: Response;
  try {
    r = await fetch(URL_APP + caminho, { method: opcoes.method || (body ? 'POST' : 'GET'), headers, body, ...(body && typeof body.pipe === 'function' ? { duplex: 'half' } : {}) } as any);
  } catch (e: any) {
    throw new ErroApp(`Sem conexão com ${URL_APP}: ${e.message}`);
  }
  const texto = await r.text();
  let dados: any = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {}
  if (r.status === 401) throw new ErroApp('O app recusou a chave. Gere outra em Configuração → "Chave para o Claude".');
  if (!r.ok || dados?.success === false) throw new ErroApp(dados?.error || `O app respondeu ${r.status}.`);
  return dados as T;
}

async function comNovaTentativa<T>(fn: () => Promise<T>, vezes = 4): Promise<T> {
  let ultimo: any;
  for (let i = 1; i <= vezes; i++) {
    try {
      return await fn();
    } catch (e: any) {
      ultimo = e;
      if (!/limite|sobrecarregado|conexão|5\d\d|429/i.test(String(e.message)) || i === vezes) throw e;
      await new Promise((r) => setTimeout(r, 2500 * i));
    }
  }
  throw ultimo;
}

async function config(): Promise<Config> {
  const r = await chamar<{ config: Config | null }>('/api/config');
  return { ...CONFIG_INICIAL, ...(r.config || {}) };
}

function titulo(a: Ata): string {
  const r = a.reuniao;
  if (!r.numero && !r.data) return 'Ata sem título';
  const d = r.data ? r.data.split('-').reverse().join('/') : '';
  return `${r.numero ? `${r.numero}ª Reunião ${r.tipo || ''}`.trim() : 'Reunião'}${d ? ` de ${d}` : ''}${a.status === 'pronta' ? '' : ' (rascunho)'}`;
}

async function lerAta(id: string): Promise<Ata> {
  const r = await chamar<{ dados: Ata }>(`/api/atas/${encodeURIComponent(id)}`);
  return { ...ATA_NOVA(), ...r.dados, id };
}

async function salvarAta(a: Ata): Promise<void> {
  await chamar('/api/atas', { method: 'PUT', json: { id: a.id, titulo: titulo(a), dados: a } });
}

async function mudarAta(id: string, fn: (a: Ata, cfg: Config) => Ata | Promise<Ata>): Promise<Ata> {
  const [a, cfg] = await Promise.all([lerAta(id), config()]);
  const nova = await fn(a, cfg);
  await salvarAta(nova);
  return nova;
}

async function enviarArquivo<T>(caminhoApi: string, arquivo: string): Promise<T> {
  const abs = path.resolve(arquivo);
  if (!fs.existsSync(abs)) throw new ErroApp(`Arquivo não encontrado: ${abs}`);
  const tam = (await fsp.stat(abs)).size;
  const corpo = tam > 50 * 1024 * 1024 ? fs.createReadStream(abs) : await fsp.readFile(abs);
  return chamar<T>(caminhoApi, {
    corpo,
    cabecalhos: { 'Content-Type': 'application/octet-stream', 'X-Nome': encodeURIComponent(path.basename(abs)), 'Content-Length': String(tam) },
  });
}

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Acha o membro pelo nome, aceitando parte do nome e sem acento. */
function acharMembro(cfg: Config, nome: string): string | null {
  const todos = cfg.grupos.flatMap((g) => g.membros.map((m) => m.nome));
  const alvo = sem(nome);
  return todos.find((n) => sem(n) === alvo) || todos.find((n) => sem(n).includes(alvo)) || todos.find((n) => alvo.split(' ').every((p) => sem(n).includes(p))) || null;
}

/** "4.3", "3" ou 3 → índice do item. */
function indiceItem(a: Ata, item: string | number): number {
  const n = Number(String(item).replace(/^4\./, ''));
  if (!Number.isInteger(n) || n < 1 || n > a.itens.length) throw new ErroApp(`Item ${item} não existe. A Ordem do dia tem ${a.itens.length} itens (4.1 a 4.${a.itens.length}).`);
  return n - 1;
}

function resumoAta(a: Ata, cfg: Config) {
  const m = montarAta(a, cfg);
  const pres = presentes(a, cfg.grupos).map((x) => x.nome);
  const ausentes = Object.entries(a.presenca)
    .filter(([, p]) => !p.presente)
    .map(([nome, p]) => (p.justificativa ? `${nome} (${p.justificativa})` : nome));
  return {
    id: a.id,
    titulo: titulo(a),
    reuniao: a.reuniao,
    status: a.status || 'rascunho',
    presentes: pres.length,
    ausentes_titulares: ausentes.filter((n) => cfg.grupos.some((g) => g.membros.some((mm) => n.startsWith(mm.nome) && mm.tipo !== 'suplente'))),
    gravacao: a.transcricao.partes.length ? `${a.transcricao.partes.length} partes transcritas, ${Math.round(a.transcricao.duracaoSeg / 60)} min` : 'sem gravação',
    redigida: Boolean(a.redigidaEm),
    itens: a.itens.map((it, k) => ({
      item: `4.${k + 1}`,
      processo: it.processo || undefined,
      assunto: assuntoDe(it).slice(0, 160),
      interessado: interessadoDe(it) || undefined,
      resultado: it.resultado || 'não marcado',
      observacao: it.observacao || undefined,
      tem_parecer: Boolean(it.parecer),
      tem_discussao: Boolean(it.discussao),
      inclusao: it.inclusao || undefined,
    })),
    pendencias: m.pendencias,
  };
}

const ok = (dados: unknown) => ({ content: [{ type: 'text' as const, text: typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2) }] });
const erro = (e: any) => ({ isError: true, content: [{ type: 'text' as const, text: e instanceof ErroApp ? e.message : `Erro: ${e?.message || e}` }] });
const seguro =
  <A,>(fn: (args: A) => Promise<any>) =>
  async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return erro(e);
    }
  };

const RESULTADO = z.enum(['aprovado', 'aprovado_ressalva', 'nao_aprovado', 'retirado', 'homologado']);

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

const srv = new McpServer(
  { name: 'atas-de-reuniao', version: '1.0.0' },
  {
    instructions: `Conector do app Atas de Reunião (${URL_APP}), que monta a ata da Congregação do IEX.
Fluxo comum: nova_ata → marcar_presenca → enviar_pauta → enviar_parecer (um por arquivo) → enviar_gravacao → redigir → marcar_resultado (o que faltar) → baixar_word → salvar_pronta.
Itens da Ordem do dia são chamados "4.1", "4.2"... O voto do parecer entra na ata copiado como está; não reescreva.
Sem gravação, use escrever para as comunicações/informes e as discussões. Em branco, a ata diz "Não houve comunicações nem informes."
Use abrir_ata para ver o estado e as pendências antes de baixar o Word.`,
  }
);

srv.registerTool(
  'listar_atas',
  { title: 'Listar atas', description: 'Lista as atas salvas no perfil (rascunhos e prontas), da mais recente para a mais antiga.', inputSchema: {} },
  seguro(async () => {
    const r = await chamar<{ atas: { id: string; titulo: string; atualizado_em: string }[] }>('/api/atas');
    return r.atas.length ? r.atas.map((a) => ({ id: a.id, titulo: a.titulo, alterada_em: a.atualizado_em })) : 'Nenhuma ata salva ainda.';
  })
);

srv.registerTool(
  'abrir_ata',
  {
    title: 'Abrir ata',
    description: 'Mostra o estado de uma ata: reunião, presença, itens com resultado e parecer, pendências. Com incluir_texto, devolve também o texto completo da ata.',
    inputSchema: { ata_id: z.string(), incluir_texto: z.boolean().optional() },
  },
  seguro(async ({ ata_id, incluir_texto }: { ata_id: string; incluir_texto?: boolean }) => {
    const [a, cfg] = await Promise.all([lerAta(ata_id), config()]);
    const r: any = resumoAta(a, cfg);
    if (incluir_texto) r.texto = textoSimples(montarAta(a, cfg));
    return r;
  })
);

srv.registerTool(
  'nova_ata',
  {
    title: 'Nova ata',
    description: 'Cria uma ata nova com a lista de conselheiros do perfil (titulares presentes, suplentes ausentes). Os dados da reunião podem vir agora ou da pauta depois.',
    inputSchema: {
      numero: z.string().optional().describe('Número da reunião, ex.: "10"'),
      tipo: z.enum(['Ordinária', 'Extraordinária']).optional(),
      data: z.string().optional().describe('aaaa-mm-dd'),
      hora: z.string().optional().describe('hh:mm'),
      local: z.string().optional(),
    },
  },
  seguro(async (p: { numero?: string; tipo?: string; data?: string; hora?: string; local?: string }) => {
    const cfg = await config();
    const a: Ata = { ...ATA_NOVA(cfg.localPadrao), presenca: presencaInicial(cfg) };
    a.reuniao = { ...a.reuniao, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) };
    const r = await chamar<{ id: string }>('/api/atas', { method: 'PUT', json: { titulo: titulo(a), dados: a } });
    return { ata_id: r.id, titulo: titulo(a), endereco: `${URL_APP}` };
  })
);

srv.registerTool(
  'dados_reuniao',
  {
    title: 'Dados da reunião',
    description: 'Muda número, tipo, data, horário, local, o texto da 1ª Parte (ata a aprovar) ou a deliberação da 1ª Parte.',
    inputSchema: {
      ata_id: z.string(),
      numero: z.string().optional(),
      tipo: z.enum(['Ordinária', 'Extraordinária']).optional(),
      data: z.string().optional().describe('aaaa-mm-dd'),
      hora: z.string().optional().describe('hh:mm'),
      local: z.string().optional(),
      primeira_parte: z.string().optional(),
      primeira_parte_deliberacao: z.string().optional().describe('ex.: "aprovada por unanimidade"'),
    },
  },
  seguro(async ({ ata_id, primeira_parte, primeira_parte_deliberacao, ...r }: any) => {
    const a = await mudarAta(ata_id, (a) => ({
      ...a,
      reuniao: { ...a.reuniao, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) },
      primeiraParte: primeira_parte ?? a.primeiraParte,
      primeiraParteResultado: primeira_parte_deliberacao ?? a.primeiraParteResultado,
    }));
    return { titulo: titulo(a), reuniao: a.reuniao };
  })
);

srv.registerTool(
  'marcar_presenca',
  {
    title: 'Marcar presença',
    description:
      'Marca quem faltou (com justificativa, se houver) e quem esteve presente (ex.: suplentes que vieram). Aceita parte do nome, sem acento. Os demais ficam como estão.',
    inputSchema: {
      ata_id: z.string(),
      ausentes: z.array(z.object({ nome: z.string(), justificativa: z.string().optional() })).optional(),
      presentes: z.array(z.string()).optional(),
    },
  },
  seguro(async ({ ata_id, ausentes = [], presentes: vieram = [] }: { ata_id: string; ausentes?: { nome: string; justificativa?: string }[]; presentes?: string[] }) => {
    const naoAchados: string[] = [];
    const a = await mudarAta(ata_id, (a, cfg) => {
      const p = { ...a.presenca };
      for (const x of ausentes) {
        const n = acharMembro(cfg, x.nome);
        if (!n) naoAchados.push(x.nome);
        else p[n] = { presente: false, justificativa: x.justificativa || '' };
      }
      for (const nome of vieram) {
        const n = acharMembro(cfg, nome);
        if (!n) naoAchados.push(nome);
        else p[n] = { presente: true, justificativa: '' };
      }
      return { ...a, presenca: p };
    });
    const cfg = await config();
    const membros = cfg.grupos.flatMap((g) => g.membros);
    return {
      presentes: presentes(a, cfg.grupos).length,
      titulares_ausentes: membros.filter((m) => m.tipo !== 'suplente' && !a.presenca[m.nome]?.presente).map((m) => (a.presenca[m.nome]?.justificativa ? `${m.nome} (${a.presenca[m.nome].justificativa})` : m.nome)),
      suplentes_presentes: membros.filter((m) => m.tipo === 'suplente' && a.presenca[m.nome]?.presente).map((m) => m.nome),
      nao_encontrados: naoAchados.length ? naoAchados : undefined,
    };
  })
);

srv.registerTool(
  'enviar_pauta',
  {
    title: 'Enviar pauta',
    description: 'Envia a convocação/pauta (PDF ou .docx, caminho no computador). O app lê os itens da Ordem do dia e preenche os dados da reunião. Substitui os itens atuais.',
    inputSchema: { ata_id: z.string(), arquivo: z.string().describe('caminho do PDF ou .docx') },
  },
  seguro(async ({ ata_id, arquivo }: { ata_id: string; arquivo: string }) => {
    const r = await enviarArquivo<{ arquivo: string; pauta: PautaLida }>(`/api/atas/${ata_id}/pauta`, arquivo);
    const a = await mudarAta(ata_id, (a) => aplicarPauta(a, r.pauta, r.arquivo));
    return { titulo: titulo(a), itens: a.itens.length, inclusoes: a.itens.filter((i) => i.inclusao).length, avisos: r.pauta.avisos };
  })
);

srv.registerTool(
  'enviar_parecer',
  {
    title: 'Enviar parecer',
    description:
      'Envia um parecer (PDF ou .docx). O app copia a parte final (o voto) e liga ao item da pauta pelo número do processo. Use "item" para escolher o item à mão.',
    inputSchema: { ata_id: z.string(), arquivo: z.string(), item: z.string().optional().describe('ex.: "4.21"') },
  },
  seguro(async ({ ata_id, arquivo, item }: { ata_id: string; arquivo: string; item?: string }) => {
    const r = await enviarArquivo<{ arquivo: string; parecer: ParecerLido }>(`/api/atas/${ata_id}/parecer`, arquivo);
    let ligado = '';
    await mudarAta(ata_id, (a) => {
      const id = item ? a.itens[indiceItem(a, item)].id : acharItem(a.itens, r.parecer);
      if (!id) return { ...a, soltos: [...(a.soltos || []), { arquivo: r.arquivo, trecho: r.parecer.trecho }] };
      ligado = `4.${a.itens.findIndex((i) => i.id === id) + 1}`;
      return { ...a, itens: a.itens.map((i) => (i.id === id ? { ...i, parecer: r.parecer.trecho, parecerArquivo: r.arquivo } : i)) };
    });
    return {
      item: ligado || `não achei o processo ${r.parecer.processo || '(sem número)'} na pauta; repita com "item"`,
      conferir: r.parecer.conferir || !r.parecer.trecho ? 'não achei com segurança a parte final; confira o trecho' : undefined,
      trecho: r.parecer.trecho,
    };
  })
);

srv.registerTool(
  'enviar_gravacao',
  {
    title: 'Enviar gravação',
    description:
      'Envia o áudio ou vídeo da reunião (qualquer tamanho). O app corta em partes de 15 min, transcreve 5 de cada vez e guarda a gravação com a ata. Pode levar alguns minutos. Substitui a transcrição atual.',
    inputSchema: { ata_id: z.string(), arquivo: z.string() },
  },
  seguro(async ({ ata_id, arquivo }: { ata_id: string; arquivo: string }) => {
    const cfg = await config();
    const nomes = cfg.grupos.flatMap((g) => g.membros.map((m) => m.nome));
    const c = await enviarArquivo<{ trabalho: string; duracaoSeg: number; partes: { n: number; inicioSeg: number; fimSeg: number }[] }>('/api/audio/cortar', arquivo);
    const feitas: ParteTranscrita[] = [];
    const falhas: number[] = [];
    let proxima = 0;
    const trabalhador = async () => {
      while (proxima < c.partes.length) {
        const p = c.partes[proxima++];
        try {
          const r = await comNovaTentativa(() => chamar<{ texto: string }>('/api/transcrever-parte', { json: { trabalho: c.trabalho, parte: p.n, nomes } }));
          feitas.push({ n: p.n, inicioSeg: p.inicioSeg, fimSeg: p.fimSeg, texto: r.texto });
        } catch {
          falhas.push(p.n);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, c.partes.length) }, trabalhador));
    let guardada = false;
    if (!falhas.length) {
      await chamar(`/api/audio/${c.trabalho}/guardar`, { json: { ata: ata_id } }).then(() => (guardada = true)).catch(() => {});
      await chamar(`/api/audio/${c.trabalho}`, { method: 'DELETE' }).catch(() => {});
    }
    await mudarAta(ata_id, (a) => ({
      ...a,
      transcricao: { partes: feitas.sort((x, y) => x.n - y.n), duracaoSeg: c.duracaoSeg, nomeOriginal: path.basename(arquivo), arquivo: guardada ? 'gravacao.mp3' : undefined },
    }));
    return {
      duracao_min: Math.round(c.duracaoSeg / 60),
      partes: c.partes.length,
      transcritas: feitas.length,
      falharam: falhas.length ? falhas.sort((x, y) => x - y) : undefined,
      aviso: falhas.length ? 'Algumas partes falharam. Envie a gravação de novo para tentar outra vez.' : undefined,
    };
  })
);

srv.registerTool(
  'ler_transcricao',
  { title: 'Ler transcrição', description: 'Devolve a transcrição completa da gravação, com o tempo de cada fala.', inputSchema: { ata_id: z.string() } },
  seguro(async ({ ata_id }: { ata_id: string }) => {
    const a = await lerAta(ata_id);
    return a.transcricao.partes.length ? transcricaoCompleta(a.transcricao.partes) : 'Esta ata não tem gravação transcrita.';
  })
);

srv.registerTool(
  'redigir',
  {
    title: 'Redigir com a gravação',
    description:
      'A IA do app escreve comunicações, proposições e a discussão de cada item a partir da transcrição, e marca os resultados que se ouviram (sem mudar o que já foi marcado). Use "retirar" para deixar algo fora da ata.',
    inputSchema: { ata_id: z.string(), retirar: z.string().optional().describe('o que não deve entrar na ata') },
  },
  seguro(async ({ ata_id, retirar }: { ata_id: string; retirar?: string }) => {
    const [a0, cfg] = await Promise.all([lerAta(ata_id), config()]);
    if (!a0.transcricao.partes.length) throw new ErroApp('Esta ata não tem gravação. Envie com enviar_gravacao ou escreva os textos com escrever.');
    const a1 = retirar !== undefined ? { ...a0, retirar } : a0;
    const r = await chamar<Redacao>('/api/redigir', { json: pedidoRedacao(a1, cfg) });
    const { ata, marcados, extras } = aplicarRedacao(a1, r);
    await salvarAta(ata);
    return {
      comunicacoes: ata.comunicacoes || '(não houve)',
      proposicoes: ata.proposicoes || '(não houve)',
      discussoes: ata.itens.map((it, k) => (it.discussao ? { item: `4.${k + 1}`, texto: it.discussao } : null)).filter(Boolean),
      resultados_marcados_pela_gravacao: marcados,
      itens_incluidos_na_hora: extras,
      pendencias: montarAta(ata, cfg).pendencias,
    };
  })
);

srv.registerTool(
  'marcar_resultado',
  {
    title: 'Marcar resultado',
    description:
      'Marca o resultado de itens da Ordem do dia: aprovado, aprovado_ressalva, nao_aprovado, retirado, homologado. Observação como continuação de frase (ex.: "com ajuste no parecer", "por falta de cadastro no SIPAC"). Votos só se houve contagem. Com sem_resultado, marca todos os itens ainda sem resultado.',
    inputSchema: {
      ata_id: z.string(),
      itens: z
        .array(
          z.object({
            item: z.string().describe('ex.: "4.3"'),
            resultado: RESULTADO,
            observacao: z.string().optional(),
            favoraveis: z.number().int().min(0).optional(),
            contrarios: z.number().int().min(0).optional(),
            abstencoes: z.number().int().min(0).optional(),
          })
        )
        .optional(),
      sem_resultado: RESULTADO.optional().describe('resultado para todos os itens ainda sem resultado'),
    },
  },
  seguro(async ({ ata_id, itens = [], sem_resultado }: any) => {
    const a = await mudarAta(ata_id, (a) => {
      const l = a.itens.map((i) => ({ ...i }));
      for (const x of itens) {
        const k = indiceItem(a, x.item);
        l[k].resultado = x.resultado as Resultado;
        if (x.observacao !== undefined) l[k].observacao = x.observacao;
        if (x.favoraveis !== undefined || x.contrarios !== undefined || x.abstencoes !== undefined) {
          l[k].votos = { favoraveis: x.favoraveis ?? null, contrarios: x.contrarios ?? null, abstencoes: x.abstencoes ?? null };
        }
      }
      if (sem_resultado) for (const i of l) if (!i.resultado) i.resultado = sem_resultado;
      return { ...a, itens: l };
    });
    const rot = (r: string) => RESULTADOS.find((x) => x.valor === r)?.rotulo || 'não marcado';
    return a.itens.map((it, k) => `4.${k + 1}: ${rot(it.resultado)}${it.observacao ? ` (${it.observacao})` : ''}`).join('\n');
  })
);

srv.registerTool(
  'escrever',
  {
    title: 'Escrever textos da ata',
    description:
      'Escreve ou corrige à mão as comunicações e informes (2ª Parte), as proposições (3ª Parte), a discussão de itens, o voto de um parecer, ou o que deve ficar fora da ata. Texto vazio apaga.',
    inputSchema: {
      ata_id: z.string(),
      comunicacoes: z.string().optional(),
      proposicoes: z.string().optional(),
      retirar: z.string().optional(),
      discussoes: z.array(z.object({ item: z.string(), texto: z.string() })).optional(),
      pareceres: z.array(z.object({ item: z.string(), trecho: z.string() })).optional(),
    },
  },
  seguro(async ({ ata_id, comunicacoes, proposicoes, retirar, discussoes = [], pareceres = [] }: any) => {
    await mudarAta(ata_id, (a) => {
      const l = a.itens.map((i) => ({ ...i }));
      for (const d of discussoes) l[indiceItem(a, d.item)].discussao = d.texto;
      for (const p of pareceres) l[indiceItem(a, p.item)].parecer = p.trecho;
      return {
        ...a,
        comunicacoes: comunicacoes ?? a.comunicacoes,
        proposicoes: proposicoes ?? a.proposicoes,
        retirar: retirar ?? a.retirar,
        itens: l,
      };
    });
    return 'Pronto.';
  })
);

srv.registerTool(
  'incluir_item',
  {
    title: 'Incluir item',
    description: 'Inclui um item na Ordem do dia (inclusão de pauta), no fim ou numa posição.',
    inputSchema: {
      ata_id: z.string(),
      assunto: z.string(),
      processo: z.string().optional(),
      interessado: z.string().optional(),
      parecerista: z.string().optional(),
      titulo: z.string().optional(),
      resultado: RESULTADO.optional(),
      observacao: z.string().optional(),
      posicao: z.number().int().min(1).optional().describe('número do item (ex.: 5 para virar 4.5); sem isso, vai para o fim'),
    },
  },
  seguro(async (p: any) => {
    let n = 0;
    await mudarAta(p.ata_id, (a) => {
      const it = itemVazio();
      it.processo = p.processo || '';
      it.campos = [
        { rotulo: 'Assunto', valor: p.assunto },
        ...(p.titulo ? [{ rotulo: 'Título', valor: p.titulo }] : []),
        ...(p.interessado ? [{ rotulo: 'Interessado', valor: p.interessado }] : []),
        ...(p.parecerista ? [{ rotulo: 'Parecerista', valor: p.parecerista }] : []),
      ];
      it.resultado = p.resultado || '';
      it.observacao = p.observacao || '';
      const l = [...a.itens];
      const pos = p.posicao ? Math.min(l.length, p.posicao - 1) : l.length;
      l.splice(pos, 0, it);
      n = pos + 1;
      return { ...a, itens: l };
    });
    return `Incluído como 4.${n}.`;
  })
);

srv.registerTool(
  'baixar_word',
  {
    title: 'Baixar a ata em Word',
    description: 'Gera o .docx da ata (padrão da Congregação, linhas numeradas) e salva no computador. Pendências saem marcadas em amarelo.',
    inputSchema: { ata_id: z.string(), pasta: z.string().optional().describe('pasta de destino; padrão: Downloads') },
  },
  seguro(async ({ ata_id, pasta }: { ata_id: string; pasta?: string }) => {
    const [a, cfg] = await Promise.all([lerAta(ata_id), config()]);
    const m = montarAta(a, cfg);
    let brasao: { dados: ArrayBuffer; tipo: 'png' | 'jpg' } | undefined;
    if (cfg.brasao) {
      const r = await fetch(`${URL_APP}/api/atas/config/arquivo/${encodeURIComponent(cfg.brasao)}`, { headers: { Authorization: `Bearer ${CHAVE}` } });
      if (r.ok) brasao = { dados: await r.arrayBuffer(), tipo: /\.png$/i.test(cfg.brasao) ? 'png' : 'jpg' };
    }
    const blob = await gerarDocx(m, brasao);
    const destino = path.join(path.resolve(pasta || PASTA_SAIDA), nomeArquivoDocx(a));
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await fsp.writeFile(destino, Buffer.from(await blob.arrayBuffer()));
    return { arquivo: destino, pendencias: m.pendencias.length ? m.pendencias : 'nenhuma' };
  })
);

srv.registerTool(
  'salvar_pronta',
  { title: 'Salvar como pronta', description: 'Marca a ata como pronta no app (sai de rascunho). Ela continua editável.', inputSchema: { ata_id: z.string() } },
  seguro(async ({ ata_id }: { ata_id: string }) => {
    const a = await mudarAta(ata_id, (a) => ({ ...a, status: 'pronta', salvaEm: new Date().toISOString() }));
    return `Salva no app como pronta: ${titulo(a)}.`;
  })
);

srv.registerTool(
  'ver_configuracao',
  {
    title: 'Ver configuração',
    description: 'Mostra o cabeçalho, quem preside, quem lavra a ata e a lista de conselheiros do perfil.',
    inputSchema: {},
  },
  seguro(async () => {
    const c = await config();
    return {
      conselho: `${c.conselho} do ${c.instituicao} (${c.sigla})`,
      presidente: c.presidente || '(em branco)',
      secretario: c.secretario ? `${c.secretario}, ${c.cargoSecretario}` : '(em branco: preencha em Configuração no app)',
      local_padrao: c.localPadrao,
      brasao: c.brasao || 'sem brasão',
      conselheiros: c.grupos.map((g) => ({ grupo: g.grupo, membros: g.membros.map((m) => `${m.nome} [${m.tipo}${m.funcao ? `, ${m.funcao}` : ''}]`) })),
    };
  })
);

await srv.connect(new StdioServerTransport());
