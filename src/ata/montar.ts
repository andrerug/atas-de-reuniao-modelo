/**
 * Monta o texto da ata no padrão da Congregação: um parágrafo corrido,
 * com os rótulos em negrito. O mesmo resultado serve para a prévia na tela e para o .docx.
 */
import type { Ata, Config, Grupo, Item, Membro } from '../tipos';
import { dataPorExtenso, dataTitulo } from './extenso';

export interface Trecho {
  t: string;
  b?: boolean; // negrito
  falta?: boolean; // campo ainda por preencher (destacado na prévia)
}

export interface AtaMontada {
  cabecalho: string[];
  titulo: string;
  corpo: Trecho[];
  pendencias: string[];
}

const comPonto = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…]["”’)]?$/.test(t) ? t : t + '.';
};
const semPonto = (s: string) => s.trim().replace(/[.;,]+$/, '');
/** Observação como continuação da frase: "Para ajuste do texto." → "para ajuste do texto" (siglas ficam como estão). */
const continuacao = (s: string) => {
  const t = semPonto(s).replace(/^[,;:]\s*/, '');
  return /^[A-ZÀ-Ú][a-zà-ú]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
};

export function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
}

/** "Representação Docente da Faculdade B" → "representantes docentes da Faculdade B" */
export function rotuloRepresentacao(grupo: string, plural: boolean): string {
  let resto = grupo.replace(/^Representa[çc][ãa]o\s+/i, '').trim();
  if (resto === grupo.trim()) return grupo; // não é representação: usa como veio
  // "dos Técnico-Administrativos" → "técnico-administrativos"
  resto = resto.replace(/^(?:d[oa]s?\s+)?(T[ée]cnico-Administrativos?|Técnicos?-Administrativos?)/i, (p) => p.replace(/^d[oa]s?\s+/i, '').toLowerCase());
  resto = resto.replace(/^(Docente|Discente|Estudantil)\b/, (p) => {
    const m = p.toLowerCase();
    return plural && !/s$/.test(m) ? m + 's' : m;
  });
  if (!plural) resto = resto.replace(/^técnico-administrativos/, 'técnico-administrativo');
  // evita parênteses dentro de parênteses: "Curso A (CAA)" → "Curso A – CAA"
  resto = resto.replace(/\s*\(([^)]+)\)/g, ' – $1');
  return `${plural ? 'representantes' : 'representante'} ${resto}`;
}

export function presentes(ata: Ata, grupos: Grupo[]): Membro[] {
  return grupos.flatMap((g) => g.membros).filter((m) => ata.presenca[m.nome]?.presente);
}

function textoPresenca(ata: Ata, grupos: Grupo[]): { texto: string; substituicoes: string[]; justificadas: string[] } {
  const partes: string[] = [];
  const substituicoes: string[] = [];
  const justificadas: string[] = [];
  const presente = (m: Membro) => Boolean(ata.presenca[m.nome]?.presente);

  for (const g of grupos) {
    const semFuncao: string[] = [];
    for (const m of g.membros) {
      const p = ata.presenca[m.nome];
      if (!p?.presente) {
        if (p?.justificativa?.trim()) justificadas.push(`${m.nome} (${semPonto(p.justificativa)})`);
        continue;
      }
      if (m.tipo === 'suplente' && m.suplenteDe) {
        const tit = g.membros.find((x) => x.nome === m.suplenteDe);
        if (tit && !presente(tit)) substituicoes.push(`${m.nome}, em substituição a ${tit.nome}`);
      }
      if (m.funcao?.trim()) partes.push(`${m.nome} (${m.funcao.trim()})`);
      else semFuncao.push(m.nome);
    }
    if (semFuncao.length) partes.push(`${juntarNomes(semFuncao)} (${rotuloRepresentacao(g.grupo, semFuncao.length > 1)})`);
  }
  return { texto: partes.join('; '), substituicoes, justificadas };
}

function frasesVotos(i: Item): string {
  const { favoraveis: f, contrarios: c, abstencoes: a } = i.votos;
  if (f == null && c == null && a == null) return 'por unanimidade';
  const p: string[] = [];
  if (f != null) p.push(`${f} ${f === 1 ? 'voto favorável' : 'votos favoráveis'}`);
  if (c != null) p.push(`${c} ${c === 1 ? 'voto contrário' : 'votos contrários'}`);
  if (a != null) p.push(`${a} ${a === 1 ? 'abstenção' : 'abstenções'}`);
  return 'com ' + juntarNomes(p);
}

function deliberacao(i: Item): Trecho[] {
  const obs = i.observacao.trim();
  const disc = i.discussao.trim();
  const saida: Trecho[] = [{ t: ' ' }, { t: 'Deliberação:', b: true }, { t: ' ' }];
  const add = (t: string, falta = false) => saida.push({ t, falta });

  if (i.resultado === 'retirado') {
    add(comPonto(`retirado de pauta${obs ? ' ' + continuacao(obs) : ''}`));
    if (disc) add(' ' + comPonto(disc));
    return saida;
  }
  if (i.resultado === 'homologado') {
    if (disc) add(comPonto(disc) + ' ');
    add('homologado pelos membros presentes.');
    if (obs) add(' ' + comPonto(obs));
    return saida;
  }

  let decisao = '';
  if (i.resultado === 'aprovado') decisao = `aprovado ${frasesVotos(i)}`;
  else if (i.resultado === 'aprovado_ressalva') {
    const o = continuacao(obs).replace(/^ressalvas?:?\s+/i, '');
    const votos = frasesVotos(i);
    const base = votos === 'por unanimidade' ? 'aprovado' : `aprovado ${votos}`;
    // "com ajuste..." emenda direto; "desde que...", "condicionado..." entram depois de vírgula
    if (!o) decisao = `${base} com ressalvas`;
    else if (/^com(?![a-zà-ú])/i.test(o)) decisao = `${base} ${o}`;
    else if (/^(desde|condicionad[oa]|mediante|sob|salvo|exceto)(?![a-zà-ú])/i.test(o)) decisao = `aprovado ${votos}, ${o}`;
    else decisao = `${base} com ${o}`;
  }
  else if (i.resultado === 'nao_aprovado') decisao = `não aprovado ${frasesVotos(i)}`;

  if (i.parecer.trim()) {
    add(`“${i.parecer.trim().replace(/^[“"]|[”"]$/g, '')}”`);
    if (disc) add(' ' + comPonto(disc));
    add(' Após leitura e discussão, o parecer foi submetido à apreciação dos membros presentes e ');
  } else if (disc) {
    add(comPonto(disc) + ' Submetido à apreciação dos membros presentes, o item foi ');
  }
  if (decisao) add(comPonto(decisao));
  else add('[resultado não marcado].', true);
  if (obs && i.resultado !== 'aprovado_ressalva') add(' ' + comPonto(obs));
  return saida;
}

function cabecaItem(n: string, i: Item): Trecho[] {
  const t: Trecho[] = [{ t: ' ' }];
  if (i.processo) t.push({ t: `${n} Processo nº ${i.processo}.`, b: true });
  else t.push({ t: n, b: true });
  for (const c of i.campos) {
    if (!c.valor.trim()) continue;
    t.push({ t: ' ' }, { t: `${c.rotulo}:`, b: true }, { t: ' ' + comPonto(c.valor) });
  }
  return t;
}

export function montarAta(ata: Ata, cfg: Config): AtaMontada {
  const pend: string[] = [];
  const r = ata.reuniao;
  const conselhoInst = `${cfg.conselho} do ${cfg.instituicao}`;
  if (!r.numero) pend.push('Número da reunião');
  if (!r.data) pend.push('Data da reunião');
  if (!r.hora) pend.push('Horário');
  if (!cfg.presidente) pend.push('Quem presidiu (Configuração)');
  if (!cfg.secretario) pend.push('Quem lavra a ata (Configuração)');

  const titulo = `ATA DA ${r.numero || '__'}ª REUNIÃO ${(r.tipo || 'Ordinária').toUpperCase()} DA ${conselhoInst.toUpperCase()}, REALIZADA EM ${
    dataTitulo(r.data) || '__ DE ______ DE ____'
  }.`;

  const corpo: Trecho[] = [];
  const add = (t: string, b = false, falta = false) => corpo.push({ t, b, falta });

  // abertura e presença
  const hora = r.hora ? r.hora.replace(/^(\d{2}):(\d{2})$/, '$1:$2') : '';
  add(`No dia ${dataPorExtenso(r.data) || '[data]'}, às ${hora || '[hora]'} horas, na ${r.local || cfg.localPadrao || '[local]'} do ${cfg.instituicao} (${cfg.sigla}), realizou-se a ${
    r.numero || '[nº]'
  }ª Reunião ${r.tipo || 'Ordinária'} da ${cfg.conselho}. `);
  const p = textoPresenca(ata, cfg.grupos);
  if (p.texto) add(`Estiveram presentes os seguintes membros: ${p.texto}.`);
  else {
    add('[lista de presença vazia].', false, true);
    pend.push('Lista de presença');
  }
  if (p.substituicoes.length) add(` ${p.substituicoes.length > 1 ? 'Atuaram como suplentes' : 'Atuou como suplente'}: ${p.substituicoes.join('; ')}.`);
  if (p.justificadas.length) add(` ${p.justificadas.length > 1 ? 'Justificaram a ausência' : 'Justificou a ausência'}: ${p.justificadas.join('; ')}.`);

  // 1ª Parte
  add(' ');
  add('1ª Parte:', true);
  add(' ' + comPonto(ata.primeiraParte || 'Apreciação e aprovação de ata anterior'));
  add(' ');
  add('Deliberação:', true);
  add(' ' + comPonto(ata.primeiraParteResultado || 'aprovada por unanimidade'));

  // 2ª Parte
  add(' ');
  add('2ª Parte:', true);
  add(' Comunicações. ' + (ata.comunicacoes.trim() ? comPonto(ata.comunicacoes) : 'Não houve comunicações nem informes.'));

  // 3ª Parte
  add(' ');
  add('3ª Parte: Proposições e indicações:', true);
  const incl = ata.itens.map((it, k) => ({ it, n: k + 1 })).filter((x) => x.it.inclusao);
  const frases: string[] = [];
  if (incl.length === 1) frases.push(`Houve a inclusão de 1 item de pauta, no ponto 4.${incl[0].n}.`);
  else if (incl.length > 1) frases.push(`Houve a inclusão de ${incl.length} itens de pauta, distribuídos nos pontos 4.${incl[0].n} a 4.${incl[incl.length - 1].n}.`);
  if (ata.proposicoes.trim()) frases.push(comPonto(ata.proposicoes));
  add(' ' + (frases.join(' ') || 'Não houve.'));

  // 4ª Parte
  add(' ');
  add('4ª Parte:', true);
  add(' Ordem do dia.');
  const semResultado: string[] = [];
  ata.itens.forEach((it, k) => {
    corpo.push(...cabecaItem(`4.${k + 1}`, it));
    corpo.push(...deliberacao(it));
    if (!it.resultado) semResultado.push(`4.${k + 1}`);
  });
  if (semResultado.length === 1) pend.push(`Resultado do item ${semResultado[0]}`);
  else if (semResultado.length > 1) pend.push(`Resultado dos itens ${juntarNomes(semResultado)}`);
  if (!ata.itens.length) pend.push('Itens da Ordem do dia (envie a pauta)');

  // encerramento
  const art = cfg.presidenteArtigo === 'o' ? 'o Presidente' : 'a Presidente';
  const artCons = cfg.presidenteArtigo === 'o' ? 'pelo Presidente' : 'pela Presidente';
  add(' ');
  add('Encerramento:', true);
  add(
    ` Nada mais havendo a tratar, ${art}, ${cfg.presidente || '[presidente]'}, agradeceu a presença dos membros e encerrou a reunião, da qual eu, ${
      cfg.secretario || '[secretário(a)]'
    }${cfg.cargoSecretario ? `, ${cfg.cargoSecretario} do ${cfg.instituicao}` : ''}, lavrei a presente ata, que vai por mim assinada, bem como ${artCons} da ${cfg.conselho} e demais membros presentes e será aprovada na próxima reunião do ${cfg.sigla}.`
  );

  // junta trechos vizinhos com o mesmo estilo
  const junto: Trecho[] = [];
  for (const t of corpo) {
    const u = junto[junto.length - 1];
    if (u && Boolean(u.b) === Boolean(t.b) && Boolean(u.falta) === Boolean(t.falta)) u.t += t.t;
    else junto.push({ ...t });
  }
  // sem espaços duplos
  for (const t of junto) t.t = t.t.replace(/ {2,}/g, ' ');

  return { cabecalho: cfg.cabecalho.filter(Boolean), titulo, corpo: junto, pendencias: pend };
}

export function textoSimples(m: AtaMontada): string {
  return [...m.cabecalho, '', m.titulo, '', m.corpo.map((t) => t.t).join('')].join('\n');
}
