/**
 * Lê a convocação/pauta (texto tirado do PDF ou .docx) sem IA:
 * cabeçalho da reunião, 1ª Parte e os itens da Ordem do dia com os rótulos
 * (Processo, Assunto, Título, Interessado, Banca, Parecerista, Período) copiados como estão.
 */

export interface Campo {
  rotulo: string;
  valor: string;
}

export interface ItemPauta {
  n: number;
  processo: string;
  campos: Campo[];
  inclusao: boolean; // veio do bloco "Inclusão de pauta"
}

export interface Reuniao {
  numero: string; // "9"
  tipo: string; // "Ordinária" | "Extraordinária"
  data: string; // "2026-09-23"
  diaSemana: string;
  hora: string; // "09:30"
  local: string;
  primeiraParte: string;
}

export interface Pauta {
  reuniao: Reuniao;
  itens: ItemPauta[];
  avisos: string[];
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Junta linhas quebradas do PDF num texto corrido. */
export function juntarLinhas(t: string): string {
  return t
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\d{1,3}$/.test(l)) // números de página
    .reduce((acc, l) => {
      if (!acc) return l;
      // palavra partida com hífen no fim da linha: "técnico-" + "administrativo"
      if (/[A-Za-zÀ-ú]-$/.test(acc)) return acc + l;
      return acc + ' ' + l;
    }, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROTULOS: Array<[RegExp, string]> = [
  [/^Assunto$/i, 'Assunto'],
  [/^T[ií]tulo$/i, 'Título'],
  [/^Interessad[oa]s?$/i, ''], // mantém como veio (Interessado/Interessada)
  [/^Banca de avalia[cç][aã]o$/i, 'Banca de Avaliação'],
  [/^Pareceristas?$/i, ''],
  [/^Relator[a]?$/i, ''],
  [/^Per[ií]odo$/i, 'Período'],
];
const RE_ROTULO =
  /(Assunto|T[ií]tulo|Interessad[oa]s?|Banca de [Aa]valia[cç][aã]o|Pareceristas?|Relatora?|Per[ií]odo)\s*:/g;
export const RE_PROCESSO = /\d{5}\.\d{6}\/\d{4}-\d{2}/;

function nomeRotulo(bruto: string): string {
  for (const [re, nome] of ROTULOS) {
    if (re.test(bruto)) {
      if (nome) return nome;
      return bruto.charAt(0).toUpperCase() + bruto.slice(1).toLowerCase();
    }
  }
  return bruto;
}

function lerItem(n: number, bloco: string, inclusao: boolean): ItemPauta {
  const texto = juntarLinhas(bloco);
  // só conta como processo do item quando o bloco começa por ele (no meio do assunto pode ser outro)
  const proc = /^Processo/i.test(texto) ? texto.match(RE_PROCESSO) : null;
  const campos: Campo[] = [];
  const marcas = [...texto.matchAll(RE_ROTULO)];
  marcas.forEach((m, i) => {
    const ini = (m.index || 0) + m[0].length;
    const fim = i + 1 < marcas.length ? marcas[i + 1].index || texto.length : texto.length;
    const valor = texto.slice(ini, fim).trim().replace(/\s+([.;,])/g, '$1');
    if (valor) campos.push({ rotulo: nomeRotulo(m[1]), valor });
  });
  if (!campos.length) campos.push({ rotulo: 'Assunto', valor: texto.replace(/^Processo\s*n?[º°o]?\.?\s*:?\s*[\d./-]+\.?\s*/i, '') });
  return { n, processo: proc ? proc[0] : '', campos, inclusao };
}

export function lerPauta(textoBruto: string): Pauta {
  const t = textoBruto.replace(/\r/g, '');
  const corrido = juntarLinhas(t);
  const avisos: string[] = [];

  const reun = corrido.match(/(\d+)\s*[ªa°º]\s*Reuni[aã]o\s+(Ordin[aá]ria|Extraordin[aá]ria)/i);
  const dataM = corrido.match(/dia\s+(\d{1,2})(?:º)?\s+de\s+([a-zçA-ZÇ]+)\s+de\s+(\d{4})/);
  const sem = corrido.match(/\(?\b((?:segunda|ter[cç]a|quarta|quinta|sexta)-feira|s[aá]bado|domingo)\b/i);
  const horaM = corrido.match(/às\s+(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i);
  const localM = corrido.match(/\bn[ao]\s+((?:sala|audit[oó]rio|mini-?audit[oó]rio|espa[cç]o|plataforma|ambiente)[^,.;]*)/i);

  let data = '';
  if (dataM) {
    const mes = MESES.indexOf(dataM[2].toLowerCase()) + 1;
    if (mes > 0) data = `${dataM[3]}-${String(mes).padStart(2, '0')}-${dataM[1].padStart(2, '0')}`;
  }
  if (!reun) avisos.push('Não achei o número da reunião na pauta.');
  if (!data) avisos.push('Não achei a data da reunião na pauta.');

  const p1 = corrido.match(/1\s*[ªa]\s*Parte\s*:?\s*(.*?)\s*2\s*[ªa]\s*Parte/i);
  let local = localM ? localM[1].trim() : '';
  if (local) local = local.charAt(0).toUpperCase() + local.slice(1);
  if (/^sala da congrega/i.test(local)) local = 'Sala da Congregação';

  const reuniao: Reuniao = {
    numero: reun ? reun[1] : '',
    tipo: reun ? (/extra/i.test(reun[2]) ? 'Extraordinária' : 'Ordinária') : 'Ordinária',
    data,
    diaSemana: sem ? sem[1].toLowerCase() : '',
    hora: horaM ? `${horaM[1].padStart(2, '0')}:${horaM[2] || '00'}` : '',
    local,
    primeiraParte: p1 ? p1[1].trim() : '',
  };

  // Ordem do dia: do "4ª Parte" até o fim (ou até "Atenciosamente")
  const iniOrdem = t.search(/4\s*[ªa]\s*Parte/i);
  let ordem = iniOrdem >= 0 ? t.slice(iniOrdem) : t;
  ordem = ordem.replace(/^.*?Ordem do dia\s*:?/is, '');
  ordem = ordem.split(/\n\s*(Atenciosamente|Cordialmente|Belém\s*,)/i)[0];

  const marcaInclusao = ordem.search(/Inclus[aã]o de pauta/i);
  const re = /(?:^|\n)\s*(\d{1,3})\s*[.)]\s+(?=Processo|Assunto|Solicita|Homologa|Aprova|Aprecia)/g;
  const inicios = [...ordem.matchAll(re)];
  const itens: ItemPauta[] = inicios.map((m, i) => {
    const ini = (m.index || 0) + m[0].length;
    const fim = i + 1 < inicios.length ? inicios[i + 1].index || ordem.length : ordem.length;
    let bloco = ordem.slice(ini, fim);
    bloco = bloco.replace(/\n\s*Inclus[aã]o de pauta\s*/i, '\n');
    const inclusao = marcaInclusao >= 0 && (m.index || 0) > marcaInclusao;
    return lerItem(Number(m[1]), bloco, inclusao);
  });
  if (!itens.length) avisos.push('Não achei itens numerados na Ordem do dia. Confira se o arquivo é a pauta.');

  // numeração em sequência (a ata usa 4.1, 4.2...)
  itens.forEach((it, i) => {
    if (it.n !== i + 1) {
      avisos.push(`A numeração da pauta pula do item ${itens[i - 1]?.n ?? 0} para o ${it.n}. Os itens foram renumerados em sequência.`);
      it.n = i + 1;
    }
  });
  return { reuniao, itens, avisos: [...new Set(avisos)] };
}
