/**
 * Regras que a tela e o conector do Claude (MCP) usam igual:
 * aplicar a pauta lida, achar o item de um parecer, montar o pedido de redação e aplicar a resposta da IA.
 */
import { Ata, Config, Item, Resultado, itemVazio, novoId } from '../tipos';
import { presentes } from './montar';
import { transcricaoCompleta } from '../utils/tempo';

export interface PautaLida {
  reuniao: { numero: string; tipo: string; data: string; diaSemana: string; hora: string; local: string; primeiraParte: string };
  itens: { n: number; processo: string; campos: { rotulo: string; valor: string }[]; inclusao: boolean }[];
  avisos: string[];
}

export interface ParecerLido {
  processo: string;
  trecho: string;
  como: 'secao' | 'fim' | 'ia' | 'nada';
  datas: string[];
  parecerista: string;
  conferir: boolean;
}

export interface Redacao {
  comunicacoes: string;
  proposicoes: string;
  itens: { n: number; discussao?: string; resultado?: string; observacao?: string; votos?: Partial<Item['votos']> }[];
  inclusoes: { assunto?: string; processo?: string; interessado?: string; resultado?: string; observacao?: string }[];
}

const VALIDOS: Resultado[] = ['aprovado', 'aprovado_ressalva', 'nao_aprovado', 'retirado', 'homologado'];
export const resultadoValido = (r?: string): Resultado => (VALIDOS.includes(r as Resultado) ? (r as Resultado) : '');
const numOuNada = (v: any) => (typeof v === 'number' && v >= 0 ? v : null);

/** Presença inicial: titulares e membros natos marcados; suplentes desmarcados. */
export function presencaInicial(cfg: Config): Ata['presenca'] {
  const p: Ata['presenca'] = {};
  for (const g of cfg.grupos) for (const m of g.membros) p[m.nome] = { presente: m.tipo !== 'suplente', justificativa: '' };
  return p;
}

export function aplicarPauta(a: Ata, p: PautaLida, arquivo: string): Ata {
  return {
    ...a,
    pautaArquivo: arquivo,
    reuniao: {
      ...a.reuniao,
      numero: p.reuniao.numero || a.reuniao.numero,
      tipo: p.reuniao.tipo || a.reuniao.tipo,
      data: p.reuniao.data || a.reuniao.data,
      diaSemana: p.reuniao.diaSemana || a.reuniao.diaSemana,
      hora: p.reuniao.hora || a.reuniao.hora,
      local: p.reuniao.local || a.reuniao.local,
    },
    primeiraParte: p.reuniao.primeiraParte || a.primeiraParte,
    itens: p.itens.map((i) => ({ ...itemVazio(), id: novoId(), processo: i.processo, campos: i.campos, inclusao: i.inclusao })),
  };
}

export const assuntoDe = (it: Item) => it.campos.find((c) => /assunto/i.test(c.rotulo))?.valor || it.campos[0]?.valor || '';
export const interessadoDe = (it: Item) => it.campos.find((c) => /interessad/i.test(c.rotulo))?.valor || '';

/** Item da pauta para o parecer: mesmo processo; se houver vários, o de mesmas datas ou mesmo parecerista. */
export function acharItem(itens: Item[], p: ParecerLido): string {
  const candidatos = itens.filter((i) => p.processo && i.processo === p.processo);
  if (candidatos.length <= 1) return candidatos[0]?.id || '';
  const livres = candidatos.filter((i) => !i.parecer);
  const lista = livres.length ? livres : candidatos;
  const porData = lista.find((i) => p.datas.some((d) => i.campos.some((c) => c.valor.includes(d))));
  if (porData) return porData.id;
  const nome = p.parecerista.replace(/^(Prof[ªa]?\.?|Dr[ªa]?\.?|Profa\.)\s*/gi, '').trim().split(' ')[0];
  const porNome = nome && lista.find((i) => i.campos.some((c) => /banca|parecer/i.test(c.rotulo) && c.valor.includes(nome)));
  return (porNome || lista[0]).id;
}

/** Corpo do pedido para /api/redigir. */
export function pedidoRedacao(ata: Ata, config: Config) {
  return {
    transcricao: transcricaoCompleta(ata.transcricao.partes),
    retirar: ata.retirar,
    conselho: `${config.conselho} do ${config.instituicao}`,
    presentes: presentes(ata, config.grupos).map((m) => (m.funcao ? `${m.nome} (${m.funcao})` : m.nome)),
    itens: ata.itens.map((it, k) => ({ n: k + 1, assunto: assuntoDe(it), interessado: interessadoDe(it), temParecer: Boolean(it.parecer) })),
  };
}

/** Aplica a redação da IA. O que a pessoa já marcou (resultado, observação, votos) vale mais que o que a IA ouviu. */
export function aplicarRedacao(a: Ata, r: Redacao): { ata: Ata; marcados: number; extras: number } {
  let marcados = 0;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim().slice(0, 60);
  const jaTem = new Set(a.itens.map((it) => norm(assuntoDe(it))));
  const itens = a.itens.map((it, k) => {
    const d = (r.itens || []).find((x) => Number(x.n) === k + 1);
    if (!d) return { ...it, discussao: '' };
    const novo: Item = { ...it, discussao: String(d.discussao || '').trim() };
    if (!it.resultado && resultadoValido(d.resultado)) {
      novo.resultado = resultadoValido(d.resultado);
      marcados++;
    }
    if (!it.observacao && d.observacao) novo.observacao = String(d.observacao);
    if (d.votos && it.votos.favoraveis == null && it.votos.contrarios == null && it.votos.abstencoes == null) {
      novo.votos = { favoraveis: numOuNada(d.votos.favoraveis), contrarios: numOuNada(d.votos.contrarios), abstencoes: numOuNada(d.votos.abstencoes) };
    }
    return novo;
  });
  const extras = (r.inclusoes || [])
    .filter((x) => x.assunto && !jaTem.has(norm(x.assunto)))
    .map((x) => {
      const it = itemVazio();
      it.processo = x.processo || '';
      it.campos = [{ rotulo: 'Assunto', valor: x.assunto || '' }, ...(x.interessado ? [{ rotulo: 'Interessado', valor: x.interessado }] : [])];
      it.resultado = resultadoValido(x.resultado);
      it.observacao = x.observacao || '';
      return it;
    });
  return {
    ata: { ...a, comunicacoes: r.comunicacoes || '', proposicoes: r.proposicoes || '', itens: [...itens, ...extras], redigidaEm: new Date().toISOString() },
    marcados,
    extras: extras.length,
  };
}

export function nomeArquivoDocx(a: Ata): string {
  const r = a.reuniao;
  return `ATA_${r.numero || 'X'}_REUNIAO_${(r.tipo || 'ORDINARIA').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()}_${
    r.data ? r.data.split('-').reverse().join('.') : 'sem-data'
  }.docx`;
}
