import React, { useRef, useState } from 'react';
import { Upload, Loader2, Download } from 'lucide-react';
import { enviarArquivo } from '../services/api';
import type { Ata, Item } from '../tipos';
import { ParecerLido, acharItem, assuntoDe, interessadoDe as interessado } from '../ata/aplicar';

interface Props {
  ata: Ata;
  mudar: (fn: (a: Ata) => Ata) => void;
}

const resumo = (it: Item) => assuntoDe(it).slice(0, 110);

/** Pareceres: o voto (parte final) entra na íntegra, entre aspas, no item correspondente. */
export const EtapaPareceres: React.FC<Props> = ({ ata, mudar }) => {
  const [enviando, setEnviando] = useState(0);
  const [avisos, setAvisos] = useState<string[]>([]);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, p: Partial<Item>) => mudar((a) => ({ ...a, itens: a.itens.map((i) => (i.id === id ? { ...i, ...p } : i)) }));

  const enviar = async (lista: FileList | null) => {
    if (!lista?.length || !ata.id) return;
    const arquivos = Array.from(lista);
    setEnviando(arquivos.length);
    const novos: string[] = [];
    let itensAtuais = ata.itens;
    for (const f of arquivos) {
      try {
        const r = await enviarArquivo<{ arquivo: string; parecer: ParecerLido }>(`/api/atas/${ata.id}/parecer`, f, { nome: f.name });
        const alvo = acharItem(itensAtuais, r.parecer);
        if (!alvo) {
          novos.push(`${f.name}: não achei o processo ${r.parecer.processo || '(sem número)'} na pauta. Escolha o item à mão na lista abaixo.`);
          mudar((a) => ({ ...a, soltos: [...(a.soltos || []), { arquivo: r.arquivo, trecho: r.parecer.trecho }] }));
          continue;
        }
        if (r.parecer.conferir || !r.parecer.trecho) novos.push(`${f.name}: não achei com segurança a parte final. Confira o texto no item.`);
        itensAtuais = itensAtuais.map((i) => (i.id === alvo ? { ...i, parecer: r.parecer.trecho, parecerArquivo: r.arquivo } : i));
        setItem(alvo, { parecer: r.parecer.trecho, parecerArquivo: r.arquivo });
      } catch (e: any) {
        novos.push(`${f.name}: ${e.message}`);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
    setAvisos(novos);
    if (arquivoRef.current) arquivoRef.current.value = '';
  };

  const soltos = ata.soltos || [];
  const ligarSolto = (k: number, itemId: string) => {
    const s = soltos[k];
    mudar((a) => ({
      ...a,
      soltos: (a.soltos || []).filter((_, i) => i !== k),
      itens: a.itens.map((i) => (i.id === itemId ? { ...i, parecer: s.trecho, parecerArquivo: s.arquivo } : i)),
    }));
  };

  return (
    <section aria-labelledby="t-par">
      <h2 id="t-par" className="ata-subtitulo">Pareceres</h2>
      <p className="text-texto-suave mb-4">
        Envie os pareceres em PDF ou Word, vários de uma vez. O app acha o processo na pauta e copia a parte final, sem mudar o texto. Confira cada trecho.
      </p>
      {!ata.itens.length && <p className="av-aviso av-aviso--atencao mb-4" role="status">Envie a pauta antes, para os pareceres acharem os seus itens.</p>}
      <label className="tr-soltar block">
        <input ref={arquivoRef} type="file" multiple accept=".pdf,.docx" className="sr-only" onChange={(e) => enviar(e.target.files)} disabled={enviando > 0 || !ata.itens.length} />
        {enviando > 0 ? <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" aria-hidden="true" /> : <Upload className="w-6 h-6 mx-auto mb-2" aria-hidden="true" />}
        <span className="font-semibold">{enviando > 0 ? `Lendo ${enviando} parecer(es)…` : 'Escolher pareceres'}</span>
      </label>
      {avisos.map((a) => (
        <p key={a} className="av-aviso av-aviso--atencao mt-3" role="status">{a}</p>
      ))}

      {soltos.map((s, k) => (
        <div key={k} className="ata-item mt-4">
          <p className="font-semibold mb-2">{s.arquivo}: escolha o item</p>
          <select aria-label={`Item do parecer ${s.arquivo}`} defaultValue="" onChange={(e) => e.target.value && ligarSolto(k, e.target.value)}>
            <option value="">Escolher…</option>
            {ata.itens.map((i, n) => (
              <option key={i.id} value={i.id}>4.{n + 1} {resumo(i).slice(0, 70)}</option>
            ))}
          </select>
          <p className="ata-citacao mt-2">“{s.trecho || 'trecho não encontrado'}”</p>
        </div>
      ))}

      <ol className="ata-itens mt-6">
        {ata.itens.map((it, k) =>
          it.parecer || it.parecerArquivo || it.campos.some((c) => /parecer|banca/i.test(c.rotulo)) ? (
            <li key={it.id} className="ata-item">
              <p className="mb-1">
                <strong>4.{k + 1}</strong> {it.processo && <span className="tabular">{it.processo} · </span>}
                {resumo(it)}
              </p>
              <p className="text-[length:var(--av-texto-sm)] text-texto-suave mb-2">
                {interessado(it)}
                {it.parecerArquivo && ata.id && (
                  <>
                    {' · '}
                    <a className="underline" href={`/api/atas/${ata.id}/arquivo/${it.parecerArquivo}`}>
                      <Download className="w-3.5 h-3.5 inline" aria-hidden="true" /> {it.parecerArquivo}
                    </a>
                  </>
                )}
              </p>
              <div className="av-campo !mb-0">
                <label htmlFor={`par-${it.id}`}>Voto que vai para a ata (entre aspas)</label>
                <textarea
                  id={`par-${it.id}`}
                  rows={it.parecer ? Math.min(10, Math.ceil(it.parecer.length / 95) + 1) : 2}
                  value={it.parecer}
                  placeholder="Sem parecer. Envie o arquivo ou cole o trecho final aqui."
                  onChange={(e) => setItem(it.id, { parecer: e.target.value })}
                />
              </div>
            </li>
          ) : null
        )}
      </ol>
    </section>
  );
};
