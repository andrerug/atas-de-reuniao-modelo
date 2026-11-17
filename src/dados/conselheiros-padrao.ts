/** Lista de exemplo, com nomes e setores fictícios. Cada pessoa troca pela composição do seu conselho em Configuração. */
import type { Grupo } from '../tipos';

export const GRUPOS_PADRAO: Grupo[] = [
  {
    "grupo": "Direção do IEX",
    "membros": [
      {
        "nome": "Ana Exemplo",
        "tipo": "nato",
        "funcao": "Diretora-Geral do IEX"
      },
      {
        "nome": "Bruno Exemplo",
        "tipo": "nato",
        "funcao": "Diretora Adjunta do IEX"
      }
    ]
  },
  {
    "grupo": "Representação do IEX no Conselho Superior",
    "membros": [
      {
        "nome": "Carla Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Diego Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Carla Exemplo"
      }
    ]
  },
  {
    "grupo": "Faculdade A",
    "membros": [
      {
        "nome": "Elisa Exemplo",
        "tipo": "titular",
        "funcao": "Diretor da Faculdade A"
      },
      {
        "nome": "Fábio Exemplo",
        "tipo": "suplente",
        "funcao": "Vice-Diretora da Faculdade A",
        "suplenteDe": "Elisa Exemplo"
      }
    ]
  },
  {
    "grupo": "Faculdade B",
    "membros": [
      {
        "nome": "Gabriela Exemplo",
        "tipo": "titular",
        "funcao": "Diretora da Faculdade B"
      },
      {
        "nome": "Heitor Exemplo",
        "tipo": "suplente",
        "funcao": "Vice-Diretora da Faculdade B",
        "suplenteDe": "Gabriela Exemplo"
      }
    ]
  },
  {
    "grupo": "Programa de Pós-Graduação A (PPGA)",
    "membros": [
      {
        "nome": "Irene Exemplo",
        "tipo": "titular",
        "funcao": "Coordenador do PPGA"
      },
      {
        "nome": "João Exemplo",
        "tipo": "titular",
        "funcao": "Vice-Coordenadora do PPGA"
      }
    ]
  },
  {
    "grupo": "Representação Docente da Faculdade A",
    "membros": [
      {
        "nome": "Karina Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Lucas Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Marta Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Lucas Exemplo"
      }
    ]
  },
  {
    "grupo": "Representação Docente da Faculdade B",
    "membros": [
      {
        "nome": "Nelson Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Olívia Exemplo",
        "tipo": "titular"
      }
    ]
  },
  {
    "grupo": "Representação Docente do PPGA",
    "membros": [
      {
        "nome": "Paulo Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Raquel Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Paulo Exemplo"
      },
      {
        "nome": "Sérgio Exemplo",
        "tipo": "titular"
      }
    ]
  },
  {
    "grupo": "Coordenação de Planejamento",
    "membros": [
      {
        "nome": "Tânia Exemplo",
        "tipo": "nato",
        "funcao": "Coordenador de Planejamento"
      }
    ]
  },
  {
    "grupo": "Representação dos Técnico-Administrativos",
    "membros": [
      {
        "nome": "Vítor Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Yara Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Wagner Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Yara Exemplo"
      },
      {
        "nome": "Beatriz Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Caio Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Beatriz Exemplo"
      },
      {
        "nome": "Denise Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Emanuel Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Denise Exemplo"
      },
      {
        "nome": "Flávia Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Gustavo Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Flávia Exemplo"
      },
      {
        "nome": "Helena Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Igor Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Helena Exemplo"
      }
    ]
  },
  {
    "grupo": "Representação Discente do Curso A (CAA)",
    "membros": [
      {
        "nome": "Júlia Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Leandro Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Júlia Exemplo"
      },
      {
        "nome": "Mirela Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Natan Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Mirela Exemplo"
      }
    ]
  },
  {
    "grupo": "Representação Discente do Curso B (CAB)",
    "membros": [
      {
        "nome": "Patrícia Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Renato Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Patrícia Exemplo"
      },
      {
        "nome": "Sílvia Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Tiago Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Sílvia Exemplo"
      }
    ]
  },
  {
    "grupo": "Representação Discente do PPGA",
    "membros": [
      {
        "nome": "Úrsula Exemplo",
        "tipo": "titular"
      },
      {
        "nome": "Valter Exemplo",
        "tipo": "suplente",
        "suplenteDe": "Úrsula Exemplo"
      },
      {
        "nome": "Ana Modelo",
        "tipo": "titular"
      },
      {
        "nome": "Bruno Modelo",
        "tipo": "suplente",
        "suplenteDe": "Ana Modelo"
      }
    ]
  }
];
