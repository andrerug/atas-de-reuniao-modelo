/**
 * Tira do parecer só a parte final (o voto), do jeito que está escrita.
 * Primeiro sem IA, pelo título da seção (III. PARECER, VOTO, CONCLUSÃO...).
 * Quem chama pode recorrer à IA quando esta leitura não achar a seção.
 */
import { RE_PROCESSO, juntarLinhas } from './pauta';

export interface ParecerLido {
  processo: string;
  trecho: string; // texto final, sem fecho, data e assinatura
  como: 'secao' | 'fim' | 'ia' | 'nada';
  datas: string[]; // datas que aparecem no parecer (ajudam a achar o item certo)
  parecerista: string;
}

const TITULO_SECAO =
  /^\s*(?:[IVXL]+|\d+)?\s*[.\-–)]?\s*(?:DO\s+|DA\s+)?(PARECER(?:\s+(?:CONCLUSIVO|FINAL|DA\s+COMISS[AÃ]O|DO\s+RELATOR[A]?))?|VOTO(?:\s+D[OA]\s+RELATOR[A]?|\s+D[OA]\s+PARECERISTA)?|CONCLUS[AÃ]O|CONSIDERA[CÇ][OÕ]ES\s+FINAIS|MANIFESTA[CÇ][AÃ]O(?:\s+FINAL)?)\s*:?\s*$/i;

const FIM =
  /^(É\s+o\s+(?:nosso\s+)?parecer|Este\s+é\s+o\s+(?:nosso\s+)?parecer|S\.?\s*m\.?\s*j|Salvo\s+melhor\s+ju[ií]zo|Belém|Marabá|Castanhal|Bragança|[A-ZÀ-Ú][a-zà-ú]+(?:\s[A-Za-zà-ú]+)?\s*(?:\(PA\))?\s*,\s*\d{1,2}\s+de\s+[a-zç]+\s+de\s+\d{4}|Documento\s+assinado|Assinado\s+digitalmente|Atenciosamente|Respeitosamente)/i;

const ABERTURAS =
  /\b(Considerando|Diante\s+do\s+exposto|Ante\s+o\s+exposto|Pelo\s+exposto|Face\s+ao\s+exposto|Em\s+face\s+do\s+exposto|Portanto|Sendo\s+assim|Assim\s+sendo|Dessa\s+forma|Desta\s+forma|Com\s+base|A\s+partir\s+d)/g;

export function lerParecer(texto: string): ParecerLido {
  const linhas = texto.replace(/\r/g, '').split('\n').map((l) => l.trim());
  const proc = texto.match(RE_PROCESSO);
  const datas = [...texto.matchAll(/\d{2}\/\d{2}\/\d{4}/g)].map((m) => m[0]);

  // quem assina: linha depois da data/assinatura que começa com Prof/Dr
  const assina = [...linhas].reverse().find((l) => /^(Prof[ªa]?\.?|Dr[ªa]?\.?|Profa\.)\s/i.test(l)) || '';

  // 1) seção final com título
  let ini = -1;
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (TITULO_SECAO.test(linhas[i]) && i > linhas.length * 0.25) {
      ini = i + 1;
      break;
    }
  }
  if (ini > 0) {
    const corpo: string[] = [];
    for (let i = ini; i < linhas.length; i++) {
      if (FIM.test(linhas[i])) break;
      corpo.push(linhas[i]);
    }
    const trecho = juntarLinhas(corpo.join('\n'));
    if (trecho.length > 40) return { processo: proc ? proc[0] : '', trecho, como: 'secao', datas, parecerista: assina };
  }

  // 2) sem título: último parágrafo conclusivo antes do fecho
  let fim = linhas.length;
  for (let i = linhas.length - 1; i >= 0; i--) {
    if (FIM.test(linhas[i])) fim = i;
  }
  // corta a partir da última frase de abertura conclusiva nas linhas finais
  const cauda = juntarLinhas(linhas.slice(Math.max(0, fim - 40), fim).join('\n'));
  const aberturas = [...cauda.matchAll(ABERTURAS)].filter((m) => {
    const antes = cauda.slice(Math.max(0, (m.index || 0) - 2), m.index);
    return (m.index || 0) === 0 || /[.:]\s?$/.test(antes);
  });
  const ultima = aberturas.reverse().find((m) => /favor[aá]vel|FAVORAVELMENTE|desfavor|contr[aá]ri|aprova/i.test(cauda.slice(m.index)));
  if (ultima) {
    return { processo: proc ? proc[0] : '', trecho: cauda.slice(ultima.index).trim(), como: 'fim', datas, parecerista: assina };
  }
  return { processo: proc ? proc[0] : '', trecho: '', como: 'nada', datas, parecerista: assina };
}

/** Confere se o texto devolvido pela IA está mesmo no parecer (ignorando espaços). */
export function estaNoTexto(trecho: string, texto: string): boolean {
  const n = (s: string) => s.replace(/[\s­-]+/g, '').toLowerCase();
  return trecho.length > 20 && n(texto).includes(n(trecho));
}
