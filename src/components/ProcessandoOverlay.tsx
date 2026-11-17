import React, { useEffect, useRef, useState } from 'react';
import { formatSecondsToTime } from '../utils/tempo';

export interface Progresso {
  etapa: string;
  detalhe: string;
  /** 0 = preparando; 1..total = parte em andamento; total+1 = juntando */
  parteAtual: number;
  totalPartes: number;
  /** situação de cada parte quando várias são transcritas ao mesmo tempo */
  estados?: Array<'espera' | 'atual' | 'feita'>;
}

interface Props {
  progresso: Progresso;
  onCancelar: () => void;
}

/** Janela de espera: a fita mostra uma divisão por parte do áudio. */
export const ProcessandoOverlay: React.FC<Props> = ({ progresso, onCancelar }) => {
  const [segundos, setSegundos] = useState(0);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    botaoRef.current?.focus();
    return () => clearInterval(t);
  }, []);

  const { parteAtual, totalPartes, estados } = progresso;
  const classe = (n: number) => {
    if (estados) return estados[n - 1] === 'feita' ? 'is-feita' : estados[n - 1] === 'atual' ? 'is-atual' : '';
    return n < parteAtual || parteAtual > totalPartes ? 'is-feita' : n === parteAtual || parteAtual === 0 ? 'is-atual' : '';
  };
  const partes = Array.from({ length: Math.max(1, totalPartes) }, (_, i) => i + 1);

  return (
    <div className="tr-modal-fundo" role="dialog" aria-modal="true" aria-labelledby="proc-titulo">
      <div className="tr-modal max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="tr-rec is-ao-vivo" aria-hidden="true" />
          <span className="text-[length:var(--av-texto-sm)] text-texto-suave tabular">
            {formatSecondsToTime(segundos)} decorridos
          </span>
        </div>

        <h2 id="proc-titulo" className="tr-titulo text-[length:var(--av-titulo-3)] mb-2">
          {progresso.etapa}
        </h2>
        <p className="text-texto-suave mb-6 min-h-[3em]" aria-live="polite">
          {progresso.detalhe}
        </p>

        <div className="tr-fita mb-2" aria-hidden="true">
          {partes.map((n) => (
            <span
              key={n}
              className={`tr-fita-parte ${classe(n)}`}
            />
          ))}
        </div>
        <p className="text-[length:var(--av-texto-xs)] text-texto-suave mb-6">
          {totalPartes > 1
            ? `O áudio foi dividido em ${totalPartes} partes. O app transcreve 5 de cada vez e no fim junta tudo na ordem.`
            : parteAtual === 0
              ? 'A gravação é cortada em partes de 15 minutos, e o app transcreve 5 partes de cada vez.'
              : 'Uma reunião de 3 horas costuma levar de 3 a 6 minutos.'}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[length:var(--av-texto-xs)] text-texto-suave">Não feche esta aba até terminar.</span>
          <button ref={botaoRef} type="button" onClick={onCancelar} className="av-btn av-btn--fantasma av-btn--pequeno">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
