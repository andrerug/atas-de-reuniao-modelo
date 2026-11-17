import { GRUPOS_PADRAO } from './dados/conselheiros-padrao';

export interface Membro {
  nome: string;
  funcao?: string; // cargo que vai entre parênteses (ex.: Diretora-Geral)
  tipo: 'nato' | 'titular' | 'suplente';
  suplenteDe?: string; // nome do titular
}

export interface Grupo {
  grupo: string; // ex.: "Representação dos Técnico-Administrativos"
  membros: Membro[];
}

export interface Config {
  cabecalho: string[]; // linhas do cabeçalho (Serviço Público Federal...)
  conselho: string; // "Congregação"
  instituicao: string; // "Instituto de Ciências Exemplo"
  sigla: string; // "IEX"
  presidente: string;
  presidenteArtigo: 'a' | 'o';
  secretario: string;
  cargoSecretario: string;
  localPadrao: string;
  brasao?: string; // arquivo guardado em /api/atas/config/arquivo/<nome>
  grupos: Grupo[];
}

export const CONFIG_INICIAL: Config = {
  cabecalho: ['Serviço Público Federal', 'Universidade Federal Exemplo', 'Instituto de Ciências Exemplo'],
  conselho: 'Congregação',
  instituicao: 'Instituto de Ciências Exemplo',
  sigla: 'IEX',
  presidente: 'Ana Exemplo',
  presidenteArtigo: 'a',
  secretario: '',
  cargoSecretario: '',
  localPadrao: 'Sala da Congregação',
  grupos: GRUPOS_PADRAO,
};

export interface Campo {
  rotulo: string;
  valor: string;
}

export type Resultado = '' | 'aprovado' | 'aprovado_ressalva' | 'nao_aprovado' | 'retirado' | 'homologado';

export const RESULTADOS: { valor: Resultado; rotulo: string }[] = [
  { valor: 'aprovado', rotulo: 'Aprovado' },
  { valor: 'aprovado_ressalva', rotulo: 'Aprovado com ressalvas' },
  { valor: 'nao_aprovado', rotulo: 'Não aprovado' },
  { valor: 'retirado', rotulo: 'Retirado de pauta' },
  { valor: 'homologado', rotulo: 'Homologado' },
];

export interface Votos {
  favoraveis: number | null;
  contrarios: number | null;
  abstencoes: number | null;
}

export interface Item {
  id: string;
  processo: string;
  campos: Campo[];
  inclusao: boolean; // incluído (no bloco "Inclusão de pauta" ou na hora)
  resultado: Resultado;
  observacao: string;
  votos: Votos;
  parecer: string; // parte final do parecer, copiada como está
  parecerArquivo?: string;
  discussao: string; // resumo da discussão (IA, editável)
}

export interface Presenca {
  presente: boolean;
  justificativa: string;
}

export interface Reuniao {
  numero: string;
  tipo: string;
  data: string; // aaaa-mm-dd
  diaSemana: string;
  hora: string; // hh:mm
  local: string;
}

export interface ParteTranscrita {
  n: number;
  inicioSeg: number;
  fimSeg: number;
  texto: string;
}

export interface Ata {
  id?: string;
  reuniao: Reuniao;
  presenca: Record<string, Presenca>;
  primeiraParte: string;
  primeiraParteResultado: string; // "aprovada por unanimidade"
  comunicacoes: string;
  proposicoes: string;
  itens: Item[];
  transcricao: { partes: ParteTranscrita[]; duracaoSeg: number; arquivo?: string; nomeOriginal?: string };
  retirar: string; // o que não deve entrar na ata
  pautaArquivo?: string;
  redigidaEm?: string;
  soltos?: { arquivo: string; trecho: string }[]; // pareceres sem item achado
  status?: 'rascunho' | 'pronta';
  salvaEm?: string;
}

export const ATA_NOVA = (localPadrao = ''): Ata => ({
  reuniao: { numero: '', tipo: 'Ordinária', data: '', diaSemana: '', hora: '', local: localPadrao },
  presenca: {},
  primeiraParte: '',
  primeiraParteResultado: 'aprovada por unanimidade',
  comunicacoes: '',
  proposicoes: '',
  itens: [],
  transcricao: { partes: [], duracaoSeg: 0 },
  retirar: '',
});

export const novoId = () => Math.random().toString(36).slice(2, 10);

export function itemVazio(): Item {
  return {
    id: novoId(),
    processo: '',
    campos: [{ rotulo: 'Assunto', valor: '' }],
    inclusao: true,
    resultado: '',
    observacao: '',
    votos: { favoraveis: null, contrarios: null, abstencoes: null },
    parecer: '',
    discussao: '',
  };
}
