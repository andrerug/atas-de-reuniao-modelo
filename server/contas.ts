/**
 * Contas do Laboratório de IA (Supabase em supabase.seu-dominio.exemplo).
 *
 * - Login com e-mail e senha da conta do laboratório (a mesma de seu-dominio.exemplo/conta).
 * - Perfil (admin ou aluno), crédito, chave própria do OpenRouter (lida do cofre
 *   só aqui no servidor), histórico de uso e conteúdos de cada pessoa.
 * - Tudo pela chave de serviço, que fica só no servidor. O navegador nunca a vê.
 *
 * Sem SUPABASE_* configurado, o app volta ao modo antigo (senha única + pasta local).
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const CONTAS_ATIVAS = Boolean(SUPABASE_URL && ANON && SERVICO);
export const NOME_APP = 'atas';
export const ENDERECO_CONTA = process.env.ENDERECO_CONTA || 'https://seu-dominio.exemplo/conta/';

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  papel: 'admin' | 'aluno';
  ativo: boolean;
  credito_usd: number;
  tem_chave_openrouter: boolean;
  modelo_openrouter: string | null;
  modelo_imagem_openrouter: string | null;
}

export class ErroConta extends Error {
  status: number;
  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

async function rest(caminho: string, init: RequestInit = {}): Promise<any> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: SERVICO,
      Authorization: `Bearer ${SERVICO}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!r.ok) {
    throw new ErroConta(dados?.message || `Banco de dados respondeu ${r.status}.`, 502);
  }
  return dados;
}

const rpc = (nome: string, corpo: unknown) => rest(`rpc/${nome}`, { method: 'POST', body: JSON.stringify(corpo) });

/** Confere e-mail e senha no Supabase Auth. Devolve o id da conta. */
export async function entrarComSenha(email: string, senha: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password: senha }),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || !d?.user?.id) {
    if (r.status === 400 || r.status === 401) throw new ErroConta('E-mail ou senha incorretos.', 401);
    throw new ErroConta('Não foi possível conferir a conta agora. Tente de novo.', 502);
  }
  return d.user.id as string;
}

// Perfil em cache curto: cada chamada à API confere se a conta continua ativa
const cachePerfil = new Map<string, { perfil: Perfil; ate: number }>();

export async function lerPerfil(uid: string, forcar = false): Promise<Perfil | null> {
  const c = cachePerfil.get(uid);
  if (!forcar && c && c.ate > Date.now()) return c.perfil;
  const linhas = await rest(`perfis?id=eq.${encodeURIComponent(uid)}&select=*`);
  const p = linhas?.[0] || null;
  if (p) {
    p.credito_usd = Number(p.credito_usd);
    cachePerfil.set(uid, { perfil: p, ate: Date.now() + 30_000 });
  }
  return p;
}

export async function saldo(uid: string): Promise<number> {
  return Number((await rpc('saldo_usd', { uid })) ?? 0);
}

export async function chaveOpenRouter(uid: string): Promise<string | null> {
  const v = await rpc('ler_chave_openrouter', { uid });
  return typeof v === 'string' && v ? v : null;
}

export async function registrarUso(
  uid: string,
  u: { acao: string; provedor: 'laboratorio' | 'openrouter'; modelo?: string; custo_usd: number; detalhes?: unknown }
) {
  try {
    await rest('uso', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        usuario_id: uid,
        app: NOME_APP,
        acao: u.acao.slice(0, 200),
        provedor: u.provedor,
        modelo: u.modelo || null,
        custo_usd: Math.max(0, Number(u.custo_usd.toFixed(6))),
        detalhes: u.detalhes || {},
      }),
    });
  } catch (e) {
    console.error('Não registrou o uso:', (e as Error).message);
  }
}

// Preços por modelo (tabela precos_modelo), atualizados a cada 10 minutos
export interface Preco {
  entrada_texto_usd_m: number;
  entrada_audio_usd_m: number;
  saida_usd_m: number;
  por_imagem_usd: number;
}
let cachePrecos: { mapa: Map<string, Preco>; ate: number } | null = null;
const PRECO_PADRAO: Preco = { entrada_texto_usd_m: 0.3, entrada_audio_usd_m: 1, saida_usd_m: 2.5, por_imagem_usd: 0 };

export async function precoDo(modelo: string): Promise<Preco> {
  if (!CONTAS_ATIVAS) return PRECO_PADRAO;
  if (!cachePrecos || cachePrecos.ate < Date.now()) {
    try {
      const linhas = await rest('precos_modelo?select=*');
      const mapa = new Map<string, Preco>();
      for (const l of linhas || []) {
        mapa.set(l.modelo, {
          entrada_texto_usd_m: Number(l.entrada_texto_usd_m),
          entrada_audio_usd_m: Number(l.entrada_audio_usd_m),
          saida_usd_m: Number(l.saida_usd_m),
          por_imagem_usd: Number(l.por_imagem_usd),
        });
      }
      cachePrecos = { mapa, ate: Date.now() + 10 * 60_000 };
    } catch {
      return PRECO_PADRAO;
    }
  }
  return cachePrecos.mapa.get(modelo) || PRECO_PADRAO;
}

// ---------------------------------------------------------------------------
// Conteúdos (transcrições) na "gaveta" de cada pessoa
// ---------------------------------------------------------------------------

export interface ResumoConteudo {
  id: string;
  titulo: string;
  tipo: string | null;
  criado_em: string;
  atualizado_em: string;
}

export async function salvarConteudo(
  uid: string,
  c: { id?: string | null; titulo: string; dados: unknown; texto_md: string; tipo?: string }
): Promise<string> {
  const corpo = {
    titulo: c.titulo.slice(0, 300),
    dados: c.dados,
    texto_md: c.texto_md,
    atualizado_em: new Date().toISOString(),
  };
  if (c.id && /^[0-9a-f-]{36}$/i.test(c.id)) {
    const r = await rest(
      `conteudos?id=eq.${c.id}&usuario_id=eq.${uid}&app=eq.${NOME_APP}&select=id`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(corpo) }
    );
    if (r?.[0]?.id) return r[0].id;
  }
  const r = await rest('conteudos?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...corpo, usuario_id: uid, app: NOME_APP, tipo: c.tipo || 'ata' }),
  });
  return r[0].id;
}

export async function listarConteudos(uid: string): Promise<ResumoConteudo[]> {
  return rest(
    `conteudos?usuario_id=eq.${uid}&app=eq.${NOME_APP}&select=id,titulo,tipo,criado_em,atualizado_em&order=atualizado_em.desc&limit=200`
  );
}

export async function lerConteudo(uid: string, id: string): Promise<{ titulo: string; dados: any; texto_md: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await rest(`conteudos?id=eq.${id}&usuario_id=eq.${uid}&app=eq.${NOME_APP}&select=titulo,dados,texto_md`);
  return r?.[0] || null;
}

export async function apagarConteudo(uid: string, id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ErroConta('Identificador inválido.');
  await rest(`conteudos?id=eq.${id}&usuario_id=eq.${uid}&app=eq.${NOME_APP}`, { method: 'DELETE' });
}
