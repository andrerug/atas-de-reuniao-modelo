import type { ParteTranscrita } from '../tipos';

export function formatSecondsToTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** Junta as partes num texto só, trocando o tempo de cada parte pelo tempo da gravação inteira. */
export function transcricaoCompleta(partes: ParteTranscrita[]): string {
  return [...partes]
    .sort((a, b) => a.n - b.n)
    .map((p) =>
      p.texto
        .split('\n')
        .map((l) =>
          l.replace(/^\s*\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/, (_m, a, b, c) => {
            const rel = c != null ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
            return `[${formatSecondsToTime(p.inicioSeg + rel)}]`;
          })
        )
        .join('\n')
    )
    .join('\n');
}
