/**
 * Atas de Reunião: servidor.
 *
 * Fluxo: lista de presença → gravação (cortada em partes de 15 min, 5 transcritas ao mesmo tempo)
 * → pauta (lida sem IA) → pareceres (só a parte final, copiada como está) → redação das partes
 * faladas pela IA → a ata em .docx é montada no navegador.
 *
 * Atas, configuração e arquivos enviados ficam guardados por pessoa (ver server/guarda.ts).
 */
import express from 'express';
import { createServer } from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();

import { CONTAS_ATIVAS, ENDERECO_CONTA, ErroConta, entrarComSenha, lerPerfil, saldo } from './server/contas';
import { Contexto, ErroIA, escolherProvedor, transcrever, gerarTexto } from './server/ia';
import { ErroPartes, PARTE_SEG, receberECortar, lerParte, apagarTrabalho, guardarAudio, hms } from './server/partes';
import { extrairTexto } from './server/documentos';
import { lerPauta } from './server/pauta';
import { lerParecer, estaNoTexto } from './server/parecer';
import { instrucaoParteReuniao, pedidoRedacao, SISTEMA_REDACAO, SISTEMA_TRECHO_PARECER } from './server/redacao';
import { salvar, listar, ler, apagar, lerConfig, pastaDe, nomeArquivo, idValido } from './server/guarda';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCAO = process.env.NODE_ENV === 'production';
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, 'dist'));

// ---------------------------------------------------------------------------
// Sessão (igual ao Transcritor: conta do laboratório ou senha única)
// ---------------------------------------------------------------------------

const SENHA_HASH = process.env.SENHA_HASH || '';
const SENHA_APP = process.env.SENHA_APP || '';
const SENHA_CONFIGURADA = CONTAS_ATIVAS || Boolean(SENHA_HASH || SENHA_APP);
const LOGIN_OBRIGATORIO = PRODUCAO || SENHA_CONFIGURADA;

const COOKIE = 'sessao_atas';
const SESSAO_DURACAO_MS = 7 * 24 * 60 * 60 * 1000;
interface Sessao {
  expira: number;
  uid: string | null;
}
const sessoes = new Map<string, Sessao>();
const falhas = new Map<string, { quantas: number; desde: number }>();
const JANELA_FALHAS_MS = 15 * 60 * 1000;
const MAX_FALHAS = 5;

function compararSeguro(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function senhaConfere(tentativa: string): boolean {
  if (SENHA_HASH) {
    const [tipo, iter, salHex, hashHex] = SENHA_HASH.split(/[:$]/);
    if (tipo !== 'pbkdf2' || !iter || !salHex || !hashHex) return false;
    const calculado = crypto.pbkdf2Sync(tentativa, Buffer.from(salHex, 'hex'), parseInt(iter, 10), hashHex.length / 2, 'sha256');
    return compararSeguro(calculado, Buffer.from(hashHex, 'hex'));
  }
  if (SENHA_APP) {
    const a = crypto.createHash('sha256').update(tentativa).digest();
    const b = crypto.createHash('sha256').update(SENHA_APP).digest();
    return compararSeguro(a, b);
  }
  return false;
}

function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('='));
  }
  return null;
}

function sessaoDe(cabecalhoCookie: string | undefined): Sessao | null {
  if (!LOGIN_OBRIGATORIO) return { expira: Infinity, uid: null };
  const token = lerCookie(cabecalhoCookie, COOKIE);
  if (!token) return null;
  const s = sessoes.get(token);
  if (!s) return null;
  if (s.expira < Date.now()) {
    sessoes.delete(token);
    return null;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Chave de acesso para o Claude (MCP): fica só o hash, ligado à conta de quem gerou
// ---------------------------------------------------------------------------

const ARQ_CHAVES = path.join(path.resolve(process.env.DADOS_DIR || path.join(process.cwd(), 'dados-local')), 'chaves.json');
interface Chave {
  hash: string;
  uid: string | null;
  criada: string;
}
let chaves: Chave[] = [];
try {
  chaves = JSON.parse(fs.readFileSync(ARQ_CHAVES, 'utf-8'));
} catch {}
const hashChave = (c: string) => crypto.createHash('sha256').update(c).digest('hex');
async function gravarChaves() {
  await fsp.mkdir(path.dirname(ARQ_CHAVES), { recursive: true });
  await fsp.writeFile(ARQ_CHAVES, JSON.stringify(chaves), { mode: 0o600 });
}
function chaveDe(req: express.Request): string | null {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(atas_[0-9a-f]{64})$/);
  return m ? m[1] : null;
}

/** Sessão de quem chama: cookie do navegador ou chave do Claude. */
function sessaoReq(req: express.Request): Sessao | null {
  const c = chaveDe(req);
  if (c) {
    const h = hashChave(c);
    const k = chaves.find((x) => compararSeguro(Buffer.from(x.hash), Buffer.from(h)));
    return k ? { expira: Infinity, uid: k.uid } : null;
  }
  return sessaoDe(req.headers.cookie);
}

function cookieSessao(token: string, maxAgeSeg: number): string {
  return [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', PRODUCAO ? 'Secure' : '', `Max-Age=${maxAgeSeg}`]
    .filter(Boolean)
    .join('; ');
}

async function contexto(req: express.Request): Promise<Contexto> {
  const s = sessaoReq(req);
  if (!s) throw new ErroIA('SENHA', 401);
  if (!CONTAS_ATIVAS || !s.uid) return { perfil: null, provedor: { tipo: 'laboratorio' } };
  const perfil = await lerPerfil(s.uid);
  if (!perfil || !perfil.ativo) throw new ErroIA('Esta conta foi desativada. Fale com o professor.', 403);
  return { perfil, provedor: await escolherProvedor(perfil) };
}

const uidDe = (req: express.Request) => sessaoReq(req)?.uid || null;

/** Dono dos arquivos temporários do corte de áudio (a sessão de quem enviou). */
function donoDe(req: express.Request): string {
  const token = chaveDe(req) || lerCookie(req.headers.cookie, COOKIE) || 'local';
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function mensagemDeErro(err: any, padrao: string): string {
  const msg = String(err?.message || err || '');
  if (msg === 'CHAVE_AUSENTE') return 'O servidor está sem a chave do Gemini. Rode de novo o configurar.sh na VPS.';
  if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(msg)) return 'O Gemini recusou a chave do laboratório. Avise o professor.';
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return 'O limite de uso do Gemini foi atingido. Espere um minuto e tente de novo.';
  if (/503|UNAVAILABLE|overloaded/i.test(msg)) return 'O Gemini está sobrecarregado agora. Tente de novo em alguns segundos.';
  if (/JSON/i.test(msg)) return 'A IA devolveu uma resposta incompleta. Tente de novo.';
  return padrao;
}

function falha(res: express.Response, err: any, padrao: string) {
  if (err instanceof ErroIA || err instanceof ErroConta || err instanceof ErroPartes) {
    if (err.message === 'SENHA') return res.status(401).json({ error: 'SENHA' });
    return res.status(err.status).json({ error: err.message });
  }
  // só a mensagem técnica no log; nunca o conteúdo da ata
  console.error(padrao, String(err?.message || err).slice(0, 300));
  return res.status(500).json({ error: mensagemDeErro(err, padrao) });
}

function lerJsonDaIA(texto: string): any {
  try {
    return JSON.parse(texto.trim());
  } catch {
    const limpo = texto.replace(/```json\n?|\n?```/g, '').trim();
    const ini = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    return JSON.parse(ini >= 0 && fim > ini ? limpo.slice(ini, fim + 1) : limpo);
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
const httpServer = createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

app.set('trust proxy', 'loopback, uniquelocal');
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '20mb' }));

app.get('/api/sessao', async (req, res) => {
  const s = sessaoReq(req);
  const base = {
    logado: Boolean(s),
    modo: CONTAS_ATIVAS ? 'conta' : 'senha',
    loginObrigatorio: LOGIN_OBRIGATORIO,
    senhaConfigurada: SENHA_CONFIGURADA,
    enderecoConta: ENDERECO_CONTA,
    parteMin: PARTE_SEG / 60,
  };
  if (!s || !CONTAS_ATIVAS || !s.uid) return res.json(base);
  try {
    const p = await lerPerfil(s.uid, true);
    if (!p || !p.ativo) return res.json({ ...base, logado: false });
    return res.json({
      ...base,
      usuario: { nome: p.nome, email: p.email, papel: p.papel },
      saldo: p.papel === 'admin' ? null : Math.max(0, await saldo(p.id)),
    });
  } catch {
    return res.json(base);
  }
});

app.post('/api/entrar', async (req, res) => {
  if (!SENHA_CONFIGURADA) return res.status(503).json({ error: 'A senha do app ainda não foi criada no servidor.' });
  const ip = req.ip || 'desconhecido';
  const agora = Date.now();
  const registro = falhas.get(ip);
  if (registro && agora - registro.desde < JANELA_FALHAS_MS && registro.quantas >= MAX_FALHAS) {
    return res.status(429).json({ error: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.' });
  }
  const contarFalha = () =>
    falhas.set(ip, registro && agora - registro.desde < JANELA_FALHAS_MS ? { quantas: registro.quantas + 1, desde: registro.desde } : { quantas: 1, desde: agora });
  const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
  let uid: string | null = null;
  if (CONTAS_ATIVAS) {
    const email = typeof req.body?.email === 'string' ? req.body.email : '';
    if (!email || !senha) return res.status(400).json({ error: 'Preencha e-mail e senha.' });
    try {
      uid = await entrarComSenha(email, senha);
    } catch (e: any) {
      if (e instanceof ErroConta && e.status === 401) contarFalha();
      return res.status(e.status || 500).json({ error: e.message });
    }
    const perfil = await lerPerfil(uid, true).catch(() => null);
    if (!perfil) return res.status(403).json({ error: 'Esta conta não tem perfil no laboratório. Fale com o professor.' });
    if (!perfil.ativo) return res.status(403).json({ error: 'Esta conta está desativada. Fale com o professor.' });
  } else if (!senha || !senhaConfere(senha)) {
    contarFalha();
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  falhas.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessoes.set(token, { expira: agora + SESSAO_DURACAO_MS, uid });
  res.setHeader('Set-Cookie', cookieSessao(token, SESSAO_DURACAO_MS / 1000));
  return res.json({ success: true });
});

app.post('/api/sair', (req, res) => {
  const token = lerCookie(req.headers.cookie, COOKIE);
  if (token) sessoes.delete(token);
  res.setHeader('Set-Cookie', cookieSessao('', 0));
  res.json({ success: true });
});

app.use('/api', (req, res, next) => {
  if (!sessaoReq(req)) return res.status(401).json({ error: 'SENHA', message: 'Entre com a sua conta.' });
  next();
});

// --- chave para o Claude: gerar (mostra uma vez), ver se existe, apagar. Só pelo navegador, com login. ---
app.get('/api/chave', (req, res) => {
  const uid = uidDe(req);
  const k = chaves.find((x) => x.uid === uid);
  res.json({ success: true, tem: Boolean(k), criada: k?.criada || null });
});
app.post('/api/chave', async (req, res) => {
  if (chaveDe(req)) return res.status(403).json({ error: 'A chave só pode ser gerada pelo navegador.' });
  const uid = uidDe(req);
  const nova = 'atas_' + crypto.randomBytes(32).toString('hex');
  chaves = [...chaves.filter((x) => x.uid !== uid), { hash: hashChave(nova), uid, criada: new Date().toISOString() }];
  await gravarChaves();
  res.json({ success: true, chave: nova });
});
app.delete('/api/chave', async (req, res) => {
  if (chaveDe(req)) return res.status(403).json({ error: 'A chave só pode ser apagada pelo navegador.' });
  const uid = uidDe(req);
  chaves = chaves.filter((x) => x.uid !== uid);
  await gravarChaves();
  res.json({ success: true });
});

setInterval(() => {
  const agora = Date.now();
  for (const [t, s] of sessoes) if (s.expira < agora) sessoes.delete(t);
  for (const [ip, r] of falhas) if (agora - r.desde > JANELA_FALHAS_MS) falhas.delete(ip);
}, 60 * 60 * 1000).unref();

// --- configuração da pessoa: lista de conselheiros, cabeçalho, presidente, secretário ---
app.get('/api/config', async (req, res) => {
  try {
    const c = await lerConfig(uidDe(req));
    res.json({ success: true, config: c.dados });
  } catch (e) {
    falha(res, e, 'Não foi possível ler a configuração.');
  }
});

app.put('/api/config', async (req, res) => {
  try {
    const uid = uidDe(req);
    const atual = await lerConfig(uid);
    await salvar(uid, { id: atual.id, tipo: 'config', titulo: 'Configuração das atas', dados: req.body?.config || {} });
    res.json({ success: true });
  } catch (e) {
    falha(res, e, 'Não foi possível salvar a configuração.');
  }
});

// --- atas (rascunhos e prontas) ---
app.get('/api/atas', async (req, res) => {
  try {
    res.json({ success: true, atas: await listar(uidDe(req), 'ata') });
  } catch (e) {
    falha(res, e, 'Não foi possível listar as atas.');
  }
});

app.get('/api/atas/:id', async (req, res) => {
  try {
    const r = await ler(uidDe(req), req.params.id);
    if (!r) return res.status(404).json({ error: 'Ata não encontrada.' });
    res.json({ success: true, id: req.params.id, titulo: r.titulo, dados: r.dados });
  } catch (e) {
    falha(res, e, 'Não foi possível abrir a ata.');
  }
});

app.put('/api/atas', async (req, res) => {
  try {
    const { id, titulo, dados } = req.body || {};
    const novo = await salvar(uidDe(req), { id: id || null, tipo: 'ata', titulo: String(titulo || 'Ata sem título').slice(0, 300), dados: dados || {} });
    res.json({ success: true, id: novo });
  } catch (e) {
    falha(res, e, 'Não foi possível salvar a ata.');
  }
});

app.delete('/api/atas/:id', async (req, res) => {
  try {
    await apagar(uidDe(req), req.params.id);
    res.json({ success: true });
  } catch (e) {
    falha(res, e, 'Não foi possível apagar a ata.');
  }
});

// --- arquivos de uma ata: pauta, pareceres, brasão (corpo cru; nome no cabeçalho X-Nome) ---
const corpoCru = express.raw({ type: () => true, limit: '60mb' });

async function guardarArquivo(req: express.Request, ata: string): Promise<{ nome: string; caminho: string; buf: Buffer }> {
  if (!idValido(ata) && ata !== 'config') throw new ErroIA('Ata inválida.', 400);
  const buf = req.body as Buffer;
  if (!Buffer.isBuffer(buf) || !buf.length) throw new ErroIA('Arquivo vazio.', 400);
  const original = decodeURIComponent(String(req.headers['x-nome'] || 'arquivo.pdf'));
  if (!/\.(pdf|docx|png|jpe?g)$/i.test(original)) throw new ErroIA('Envie PDF ou Word (.docx).', 400);
  const pasta = pastaDe(uidDe(req), ata);
  await fsp.mkdir(pasta, { recursive: true });
  let nome = nomeArquivo(original);
  // não sobrescreve um arquivo de mesmo nome
  for (let i = 2; fs.existsSync(path.join(pasta, nome)); i++) nome = nomeArquivo(original).replace(/(\.\w+)$/, `_${i}$1`);
  await fsp.writeFile(path.join(pasta, nome), buf);
  return { nome, caminho: path.join(pasta, nome), buf };
}

app.post('/api/atas/:id/pauta', corpoCru, async (req, res) => {
  try {
    const a = await guardarArquivo(req, req.params.id);
    const texto = await extrairTexto(a.buf, a.nome);
    if (texto.replace(/\s/g, '').length < 50) {
      return res.status(422).json({ error: 'Não consegui ler o texto deste arquivo. Se for um PDF escaneado (imagem), exporte de novo pelo SIPAC/SEI ou envie o .docx.' });
    }
    res.json({ success: true, arquivo: a.nome, pauta: lerPauta(texto) });
  } catch (e) {
    falha(res, e, 'Não foi possível ler a pauta.');
  }
});

app.post('/api/atas/:id/parecer', corpoCru, async (req, res) => {
  try {
    const a = await guardarArquivo(req, req.params.id);
    const texto = await extrairTexto(a.buf, a.nome);
    if (texto.replace(/\s/g, '').length < 50) {
      return res.status(422).json({ error: 'Não consegui ler o texto deste parecer. Se for um PDF escaneado, envie a versão em .docx ou cole o trecho à mão.' });
    }
    const p = lerParecer(texto);
    let conferir = false;
    if (p.como === 'nada' || p.como === 'fim') {
      // recorre à IA, mas só aceita se o trecho estiver de fato no parecer
      try {
        const ctx = await contexto(req);
        const r = await gerarTexto(ctx, SISTEMA_TRECHO_PARECER, texto.slice(-20000), true, 'achar o voto de um parecer');
        const t = String(lerJsonDaIA(r.texto)?.trecho || '').trim();
        if (t && estaNoTexto(t, texto)) {
          p.trecho = t.replace(/\s+/g, ' ');
          p.como = 'ia';
        } else conferir = true;
      } catch (e: any) {
        if (e instanceof ErroIA && e.status === 401) throw e;
        conferir = true;
      }
    }
    res.json({ success: true, arquivo: a.nome, parecer: { ...p, conferir: conferir || p.como === 'nada' } });
  } catch (e) {
    falha(res, e, 'Não foi possível ler o parecer.');
  }
});

app.post('/api/atas/:id/brasao', corpoCru, async (req, res) => {
  try {
    const a = await guardarArquivo(req, 'config');
    res.json({ success: true, arquivo: a.nome });
  } catch (e) {
    falha(res, e, 'Não foi possível guardar a imagem.');
  }
});

app.get('/api/atas/:id/arquivo/:nome', async (req, res) => {
  const ata = req.params.id;
  if (!idValido(ata) && ata !== 'config') return res.status(400).end();
  const nome = path.basename(req.params.nome);
  const caminho = path.join(pastaDe(uidDe(req), ata), nome);
  if (!fs.existsSync(caminho)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.download(caminho, nome);
});

// --- gravação: corte, transcrição por parte e guarda do áudio comprimido ---
app.post('/api/audio/cortar', async (req, res) => {
  try {
    const r = await receberECortar(req, donoDe(req));
    res.json({ success: true, ...r, parteMin: PARTE_SEG / 60 });
  } catch (e: any) {
    if (e instanceof ErroPartes && e.message === 'SEM_FFMPEG') return res.status(501).json({ error: 'O servidor está sem o ffmpeg.' });
    falha(res, e, 'Não foi possível receber e cortar a gravação.');
  }
});

app.delete('/api/audio/:trabalho', async (req, res) => {
  await apagarTrabalho(req.params.trabalho, donoDe(req)).catch(() => {});
  res.json({ success: true });
});

app.post('/api/audio/:trabalho/guardar', async (req, res) => {
  try {
    const ata = String(req.body?.ata || '');
    if (!idValido(ata)) return res.status(400).json({ error: 'Ata inválida.' });
    const destino = path.join(pastaDe(uidDe(req), ata), 'gravacao.mp3');
    await guardarAudio(req.params.trabalho, donoDe(req), destino);
    res.json({ success: true, arquivo: 'gravacao.mp3' });
  } catch (e) {
    falha(res, e, 'Não foi possível guardar a gravação.');
  }
});

app.post('/api/transcrever-parte', async (req, res) => {
  try {
    const { trabalho, parte } = req.body || {};
    const nomes: string[] = Array.isArray(req.body?.nomes) ? req.body.nomes.slice(0, 80).map((n: any) => String(n).slice(0, 80)) : [];
    const p = await lerParte(trabalho, Number(parte), donoDe(req));
    const ctx = await contexto(req);
    const instrucao = instrucaoParteReuniao(p.n, p.total, hms(p.inicioSeg), hms(p.fimSeg), nomes);
    const r = await transcrever(ctx, p.base64, p.mimeType, instrucao, `atas: transcrever parte ${p.n} de ${p.total}`, { parteComTempo: true });
    res.json({ success: true, parte: p.n, total: p.total, inicioSeg: p.inicioSeg, fimSeg: p.fimSeg, texto: r.texto });
  } catch (e) {
    falha(res, e, `Não foi possível transcrever a parte ${req.body?.parte || ''} da gravação.`);
  }
});

// --- redação das partes faladas (comunicações, proposições, discussão dos itens) ---
app.post('/api/redigir', async (req, res) => {
  try {
    const b = req.body || {};
    const transcricao = String(b.transcricao || '').trim();
    if (transcricao.length < 30) return res.status(400).json({ error: 'A transcrição está vazia. Envie a gravação antes.' });
    const ctx = await contexto(req);
    const r = await gerarTexto(
      ctx,
      SISTEMA_REDACAO,
      pedidoRedacao({
        itens: Array.isArray(b.itens) ? b.itens : [],
        transcricao,
        retirar: String(b.retirar || ''),
        presentes: Array.isArray(b.presentes) ? b.presentes : [],
        conselho: String(b.conselho || 'Conselho'),
      }),
      true,
      'atas: redigir a ata'
    );
    const j = lerJsonDaIA(r.texto);
    res.json({
      success: true,
      comunicacoes: String(j?.comunicacoes || ''),
      proposicoes: String(j?.proposicoes || ''),
      itens: Array.isArray(j?.itens) ? j.itens : [],
      inclusoes: Array.isArray(j?.inclusoes) ? j.inclusoes : [],
    });
  } catch (e) {
    falha(res, e, 'Não foi possível redigir a ata.');
  }
});

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

async function iniciar() {
  if (!PRODUCAO) {
    const { createServer: viteServer } = await import('vite');
    const vite = await viteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  }
  httpServer.listen(port, host, () => console.log(`Atas de Reunião em http://${host}:${port} (${CONTAS_ATIVAS ? 'contas' : 'senha'})`));
}
iniciar();
