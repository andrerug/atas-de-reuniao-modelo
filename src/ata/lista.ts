/**
 * Lê a lista de conselheiros colada da página do conselho (tabela "NOME / FUNÇÃO"):
 * - "Nome<TAB>Função" → membro com função, agrupado pelo órgão (IEX, Faculdade B...);
 * - "Nome (Titular)" seguido de uma linha "Representação ..." → abre o grupo dessa representação;
 * - as linhas seguintes "Nome (Titular)" / "Nome (Suplente)" entram no grupo aberto;
 *   o suplente fica ligado ao titular que vem logo antes dele.
 */
import type { Grupo, Membro } from '../tipos';

const tipoDe = (s: string): Membro['tipo'] | null =>
  /\(\s*suplente\s*\)/i.test(s) ? 'suplente' : /\(\s*titular\s*\)/i.test(s) ? 'titular' : null;
const limparNome = (s: string) => s.replace(/\(\s*(titular|suplente)\s*\)/i, '').replace(/\s+/g, ' ').trim();
const ehRepresentacao = (s: string) => /^Representa[çc][ãa]o\b/i.test(s.trim()) && !tipoDe(s);
const pareceNome = (s: string) => /^[A-ZÀ-Ú][a-zà-ú]+(\s+[A-Za-zÀ-ú.'-]+)+$/.test(s.trim());

/** "Diretor da Faculdade B" → "Faculdade B"; representação fica como está. */
function grupoDaFuncao(f: string): string {
  if (/repres/i.test(f)) return f;
  const m = f.match(/\s(?:do|da|no|na)\s+(.+)$/i);
  return m ? m[1].trim() : f;
}

export function lerListaColada(texto: string): Grupo[] {
  const linhas = texto
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim());
  const grupos: Grupo[] = [];
  const grupo = (nome: string) => {
    let g = grupos.find((x) => x.grupo.toLowerCase() === nome.toLowerCase());
    if (!g) grupos.push((g = { grupo: nome, membros: [] }));
    return g;
  };
  let atual: Grupo | null = null;
  let ultimoTitular: Membro | null = null;

  for (let i = 0; i < linhas.length; i++) {
    const bruta = linhas[i];
    const [colNome, colFuncao = ''] = bruta.split('\t').map((x) => x.trim());
    const nome = limparNome(colNome);
    const tipo = tipoDe(colNome);
    if (!pareceNome(nome) || ehRepresentacao(colNome)) continue;

    const m: Membro = { nome, tipo: tipo || 'nato' };
    if (tipo === 'suplente' && ultimoTitular) m.suplenteDe = ultimoTitular.nome;

    if (colFuncao) {
      // tem função na mesma linha
      m.funcao = colFuncao.replace(/\s+/g, ' ');
      atual = grupo(grupoDaFuncao(m.funcao));
      if (/repres/i.test(m.funcao)) delete m.funcao; // representação não vai entre parênteses como cargo
    } else if (i + 1 < linhas.length && ehRepresentacao(linhas[i + 1])) {
      atual = grupo(linhas[i + 1].trim());
      i++;
    } else if (!atual || !tipo) {
      atual = grupo('Outros membros');
    }
    atual.membros.push(m);
    if (m.tipo !== 'suplente') ultimoTitular = m;
  }
  return grupos.filter((g) => g.membros.length);
}
