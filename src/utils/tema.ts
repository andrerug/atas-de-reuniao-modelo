import { useEffect, useState } from 'react';

export type Tema = 'light' | 'dark';
const CHAVE = 'tema-atas';

function temaInicial(): Tema {
  const atual = document.documentElement.getAttribute('data-theme');
  return atual === 'dark' ? 'dark' : 'light';
}

/** Tema claro por padrão (leitura longa); a escolha fica salva neste navegador. */
export function usarTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', tema === 'dark' ? '#0F1115' : '#F2F4F8');
    try {
      localStorage.setItem(CHAVE, tema);
    } catch {}
  }, [tema]);

  return [tema, () => setTema((t) => (t === 'dark' ? 'light' : 'dark'))];
}
