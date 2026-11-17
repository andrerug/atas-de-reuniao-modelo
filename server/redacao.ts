/** Pedidos à IA: transcrição de cada parte da gravação e redação das partes da ata que vêm da fala. */

export function instrucaoParteReuniao(n: number, total: number, inicio: string, fim: string, nomes: string[]) {
  return `Este é o trecho ${n} de ${total} da gravação de uma reunião de conselho universitário em português (pt-BR). Ele vai de ${inicio} a ${fim} da gravação completa.
Transcreva este trecho integralmente e com fidelidade.
Formato obrigatório, uma linha por fala e uma nova linha a cada mudança de assunto ou a cada 30 a 60 segundos:
[mm:ss] Falante: texto
- O tempo [mm:ss] conta a partir do início DESTE trecho (o trecho começa em [00:00]).
- Falante: use o nome quando a própria fala ou quem preside disser quem é (ex.: "com a palavra a professora Helena Exemplo"). Se não der para saber, use "Presidente", "Conselheiro 1", "Conselheira 2", "Participante".
${nomes.length ? `- Membros do conselho (para grafar os nomes certo): ${nomes.join('; ')}.\n` : ''}- Preserve números de processo, datas, nomes e termos técnicos. Tire só hesitações e repetições sem sentido.
Responda só com as linhas da transcrição.`;
}

export interface PedidoRedacao {
  itens: { n: number; assunto: string; interessado: string; temParecer: boolean }[];
  transcricao: string;
  retirar: string;
  presentes: string[];
  conselho: string;
}

export const SISTEMA_REDACAO = `Você é secretário(a) de um conselho universitário e redige atas no padrão da administração pública federal.
Escreva em português formal, terceira pessoa, verbos no pretérito, frases diretas, sem adjetivos de valor e sem opinião.
Use só o que está na transcrição. Não invente falas, números, datas nem decisões. Se a transcrição não deixar claro, deixe o campo vazio.
Responda APENAS com JSON válido.`;

export function pedidoRedacao(p: PedidoRedacao): string {
  const itens = p.itens
    .map((i) => `4.${i.n} | ${i.assunto.slice(0, 220)}${i.interessado ? ` | Interessado(a): ${i.interessado.slice(0, 80)}` : ''}${i.temParecer ? ' | tem parecer escrito' : ''}`)
    .join('\n');
  return `Conselho: ${p.conselho}
Membros presentes: ${p.presentes.join('; ') || 'não informado'}

Itens da Ordem do dia (4ª Parte):
${itens || '(nenhum item informado)'}

${p.retirar.trim() ? `O SECRETÁRIO PEDIU PARA DEIXAR FORA DA ATA: ${p.retirar.trim()}\nNada disso pode aparecer em nenhum campo.\n` : ''}
Tarefa: a partir da transcrição abaixo, escreva as partes da ata que dependem do que foi falado.

1. "comunicacoes" (2ª Parte): uma frase por comunicação ou informe, no padrão "O Diretor da FEF, Elisa Exemplo, comunicou que...", "A TAE Fulana informou sobre...". Só o essencial de cada uma. Vazio se não houve.
2. "proposicoes" (3ª Parte): propostas, indicações ou pedidos de inclusão/retirada de itens feitos no início da reunião. Vazio se não houve.
3. "itens": para cada item da Ordem do dia em que houve discussão de fato (além da leitura do parecer), um resumo da discussão em 1 a 6 frases, dizendo quem falou e o que defendeu ou pediu. Em "resultado", o que a transcrição mostra da votação: "aprovado", "aprovado_ressalva", "nao_aprovado", "retirado", "homologado" ou "" se não estiver claro. Em "observacao", o ajuste, a ressalva ou o motivo da retirada, se foi dito, escrito como continuação de frase em minúsculas (ex.: "com ajuste no cronograma do projeto e no parecer"; "desde que seja assegurado outro servidor para o instituto"; "por falta de cadastro de processo no SIPAC"). Em "votos", só se houve contagem falada.
4. "inclusoes": itens que NÃO estão na lista acima e foram incluídos na reunião (inclusive os pedidos de inclusão aceitos na 3ª Parte), com assunto, interessado e o que foi decidido.

Formato:
{
  "comunicacoes": "",
  "proposicoes": "",
  "itens": [ { "n": 1, "discussao": "", "resultado": "", "observacao": "", "votos": { "favoraveis": null, "contrarios": null, "abstencoes": null } } ],
  "inclusoes": [ { "assunto": "", "processo": "", "interessado": "", "resultado": "", "observacao": "" } ]
}
Inclua em "itens" só os itens sobre os quais a transcrição diz algo.

TRANSCRIÇÃO:
${p.transcricao}`;
}

export const SISTEMA_TRECHO_PARECER = `Você recebe o texto de um parecer. Copie, sem mudar nenhuma palavra, só a parte final em que o parecerista dá o voto ou a conclusão (normalmente a seção "Parecer", "Voto" ou "Conclusão", ou o último parágrafo que diz se é favorável ou contrário).
Não inclua o título da seção, o fecho ("É o parecer", "s.m.j."), local, data nem assinatura.
Responda APENAS com JSON: {"trecho": "..."}`;
