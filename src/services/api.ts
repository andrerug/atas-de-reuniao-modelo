/**
 * Chamadas ao servidor. Se a sessão expirar (401 "SENHA"), avisa o App para
 * mostrar a tela de senha de novo.
 */

type OuvinteSessao = () => void;
let aoPerderSessao: OuvinteSessao | null = null;

export function quandoPerderSessao(fn: OuvinteSessao) {
  aoPerderSessao = fn;
}

export class ErroApi extends Error {
  status: number;
  constructor(mensagem: string, status: number) {
    super(mensagem);
    this.status = status;
  }
}

export async function api<T = any>(
  caminho: string,
  opcoes: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: opcoes.method || (opcoes.body ? 'POST' : 'GET'),
      headers: opcoes.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      credentials: 'same-origin',
      signal: opcoes.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ErroApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  }

  let dados: any = null;
  try {
    dados = await resposta.json();
  } catch {
    // resposta sem JSON (ex.: 413 do proxy)
  }

  if (resposta.status === 401 && dados?.error === 'SENHA') {
    aoPerderSessao?.();
    throw new ErroApi('Sua sessão terminou. Entre com a senha de novo.', 401);
  }
  if (resposta.status === 413) {
    throw new ErroApi('O arquivo passou do tamanho que o servidor aceita por vez.', 413);
  }
  if (!resposta.ok || (dados && dados.success === false)) {
    throw new ErroApi(dados?.error || `O servidor respondeu com erro (${resposta.status}).`, resposta.status);
  }
  return dados as T;
}

/** Repete a chamada quando o erro é passageiro (limite, sobrecarga, rede). */
export async function comNovaTentativa<T>(
  fn: () => Promise<T>,
  tentativas = 3,
  aoTentarDeNovo?: (n: number) => void
): Promise<T> {
  let ultimo: any;
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (e: any) {
      ultimo = e;
      const passageiro = e instanceof ErroApi && (e.status === 0 || e.status === 429 || e.status >= 500);
      if (e?.name === 'AbortError' || !passageiro || i === tentativas) throw e;
      aoTentarDeNovo?.(i + 1);
      await new Promise((r) => setTimeout(r, 2500 * i));
    }
  }
  throw ultimo;
}

/** Envia um arquivo grande (corpo cru) mostrando o andamento do envio. */
export function enviarArquivo<T = any>(
  caminho: string,
  arquivo: Blob,
  opcoes: { signal?: AbortSignal; aoEnviar?: (fracao: number) => void; nome?: string } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', caminho);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    if (opcoes.nome) xhr.setRequestHeader('X-Nome', encodeURIComponent(opcoes.nome));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opcoes.aoEnviar?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ErroApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0));
    xhr.onabort = () => reject(new DOMException('cancelado', 'AbortError'));
    xhr.onload = () => {
      let dados: any = null;
      try {
        dados = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 401 && dados?.error === 'SENHA') {
        aoPerderSessao?.();
        return reject(new ErroApi('Sua sessão terminou. Entre de novo.', 401));
      }
      if (xhr.status === 413) return reject(new ErroApi(dados?.error || 'O arquivo passou do tamanho que o servidor aceita.', 413));
      if (xhr.status < 200 || xhr.status >= 300 || dados?.success === false) {
        return reject(new ErroApi(dados?.error || `O servidor respondeu com erro (${xhr.status}).`, xhr.status));
      }
      resolve(dados as T);
    };
    opcoes.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(arquivo);
  });
}

/** Roda as tarefas com no máximo `limite` ao mesmo tempo, mantendo a ordem do resultado. */
export async function emParalelo<T>(tarefas: (() => Promise<T>)[], limite: number, signal?: AbortSignal): Promise<T[]> {
  const resultados: T[] = new Array(tarefas.length);
  let proxima = 0;
  let erro: any = null;
  const trabalhador = async () => {
    while (!erro && proxima < tarefas.length) {
      if (signal?.aborted) throw new DOMException('cancelado', 'AbortError');
      const i = proxima++;
      try {
        resultados[i] = await tarefas[i]();
      } catch (e) {
        erro = erro || e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador));
  if (erro) throw erro;
  return resultados;
}
