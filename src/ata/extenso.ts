const UNID = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEM = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function ate999(n: number): string {
  if (n < 20) return UNID[n];
  if (n < 100) return DEZ[Math.floor(n / 10)] + (n % 10 ? ' e ' + UNID[n % 10] : '');
  if (n === 100) return 'cem';
  return CEM[Math.floor(n / 100)] + (n % 100 ? ' e ' + ate999(n % 100) : '');
}

export function numeroPorExtenso(n: number): string {
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteMil = mil === 1 ? 'mil' : `${ate999(mil)} mil`;
  if (!resto) return parteMil;
  return `${parteMil}${resto < 100 || resto % 100 === 0 ? ' e ' : ' '}${ate999(resto)}`;
}

/** "2026-09-23" → "vinte e três de setembro de dois mil e vinte e seis" */
export function dataPorExtenso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const dia = Number(m[3]);
  return `${dia === 1 ? 'primeiro' : numeroPorExtenso(dia)} de ${MESES[Number(m[2]) - 1]} de ${numeroPorExtenso(Number(m[1]))}`;
}

/** "2026-09-23" → "23 DE SETEMBRO DE 2026" */
export function dataTitulo(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${Number(m[3])} DE ${MESES[Number(m[2]) - 1].toUpperCase()} DE ${m[1]}`;
}

export function dataCurta(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
