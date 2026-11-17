import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { api } from '../services/api';

interface Resumo {
  id: string;
  titulo: string;
  atualizado_em: string;
}

interface Props {
  abrir: (id: string) => void;
  fechar: () => void;
  atual?: string;
  aoApagar: (id: string) => void;
}

/** Atas guardadas no perfil (rascunhos e prontas). */
export const ListaAtas: React.FC<Props> = ({ abrir, fechar, atual, aoApagar }) => {
  const [atas, setAtas] = useState<Resumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<{ atas: Resumo[] }>('/api/atas')
      .then((r) => setAtas(r.atas))
      .catch((e) => setErro(e.message));
  }, []);

  const apagar = async (a: Resumo) => {
    if (!window.confirm(`Apagar "${a.titulo}"? A ata e os arquivos dela (pauta, pareceres e gravação) saem do servidor e não dá para desfazer.`)) return;
    try {
      await api(`/api/atas/${a.id}`, { method: 'DELETE' });
      setAtas((l) => (l || []).filter((x) => x.id !== a.id));
      aoApagar(a.id);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  return (
    <Modal titulo="Atas salvas" onFechar={fechar} larguraMax="max-w-xl">
      {erro && <p className="av-aviso av-aviso--erro mb-3" role="alert">{erro}</p>}
      {!atas ? (
        <Loader2 className="w-6 h-6 animate-spin text-texto-suave" aria-label="Carregando" />
      ) : !atas.length ? (
        <p className="text-texto-suave">Nenhuma ata salva ainda.</p>
      ) : (
        <ul className="ata-lista">
          {atas.map((a) => (
            <li key={a.id}>
              <button type="button" className="ata-lista-abrir" onClick={() => abrir(a.id)} aria-current={a.id === atual ? 'true' : undefined}>
                <span className="font-semibold">{a.titulo}</span>
                <span className="text-[length:var(--av-texto-xs)] text-texto-suave">alterada em {new Date(a.atualizado_em).toLocaleString('pt-BR')}</span>
              </button>
              <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => apagar(a)} aria-label={`Apagar ${a.titulo}`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
