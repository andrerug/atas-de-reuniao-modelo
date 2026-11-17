import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  titulo: string;
  onFechar: () => void;
  larguraMax?: string;
  children: React.ReactNode;
  rodape?: React.ReactNode;
}

/** Janela com foco preso dentro, Esc fecha e o foco volta para onde estava. */
export const Modal: React.FC<ModalProps> = ({ titulo, onFechar, larguraMax = 'max-w-lg', children, rodape }) => {
  const caixaRef = useRef<HTMLDivElement>(null);
  const idTitulo = useRef(`modal-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const focaveis = () =>
      Array.from(
        caixaRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
        ) || []
      );
    focaveis()[0]?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onFechar();
      }
      if (e.key === 'Tab') {
        const els = focaveis();
        if (!els.length) return;
        const primeiro = els[0];
        const ultimo = els[els.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
  }, []);

  return (
    <div className="tr-modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={caixaRef} className={`tr-modal ${larguraMax}`} role="dialog" aria-modal="true" aria-labelledby={idTitulo}>
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3">
          <h2 id={idTitulo} className="tr-titulo text-[length:var(--av-titulo-4)]">
            {titulo}
          </h2>
          <button type="button" onClick={onFechar} className="av-btn av-btn--fantasma av-btn--pequeno px-3" aria-label="Fechar">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 pb-5 overflow-y-auto">{children}</div>
        {rodape && <div className="px-6 py-4 border-t border-linha">{rodape}</div>}
      </div>
    </div>
  );
};
