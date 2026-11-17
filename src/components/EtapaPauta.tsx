import React, { useRef, useState } from 'react';
import { Upload, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Download } from 'lucide-react';
import { enviarArquivo } from '../services/api';
import { Ata, Item, RESULTADOS, Resultado, itemVazio } from '../tipos';
import { PautaLida, aplicarPauta } from '../ata/aplicar';

interface Props {
  ata: Ata;
  mudar: (fn: (a: Ata) => Ata) => void;
}

const numero = (v: string) => (v === '' ? null : Math.max(0, parseInt(v, 10) || 0));

/** Pauta: lida do PDF/Word; cada processo ganha resultado, observação e votos. */
export const EtapaPauta: React.FC<Props> = ({ ata, mudar }) => {
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const setItem = (id: string, p: Partial<Item>) => mudar((a) => ({ ...a, itens: a.itens.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
  const mover = (k: number, d: number) =>
    mudar((a) => {
      const l = [...a.itens];
      const [x] = l.splice(k, 1);
      l.splice(Math.max(0, Math.min(l.length, k + d)), 0, x);
      return { ...a, itens: l };
    });

  const enviar = async (f: File | undefined) => {
    if (!f || !ata.id) return;
    if (ata.itens.length && !window.confirm('Ler esta pauta substitui os itens atuais (resultados e observações também). Continuar?')) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await enviarArquivo<{ arquivo: string; pauta: PautaLida }>(`/api/atas/${ata.id}/pauta`, f, { nome: f.name });
      const p = r.pauta;
      mudar((a) => aplicarPauta(a, p, r.arquivo));
      setAvisos(p.avisos);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  };

  return (
    <section aria-labelledby="t-pauta">
      <h2 id="t-pauta" className="ata-subtitulo">Convocação e pauta</h2>
      <label className="tr-soltar block">
        <input ref={arquivoRef} type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => enviar(e.target.files?.[0])} disabled={enviando} />
        {enviando ? <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" aria-hidden="true" /> : <Upload className="w-6 h-6 mx-auto mb-2" aria-hidden="true" />}
        <span className="font-semibold">{enviando ? 'Lendo a pauta…' : ata.itens.length ? 'Enviar outra pauta' : 'Escolher a pauta (PDF ou Word)'}</span>
        <span className="block text-[length:var(--av-texto-sm)] text-texto-suave">O app copia o texto de cada processo como está na pauta.</span>
      </label>
      {ata.pautaArquivo && ata.id && (
        <p className="text-[length:var(--av-texto-sm)] mt-2">
          <a className="underline" href={`/api/atas/${ata.id}/arquivo/${ata.pautaArquivo}`}>
            <Download className="w-3.5 h-3.5 inline" aria-hidden="true" /> {ata.pautaArquivo}
          </a>
        </p>
      )}
      {erro && <p className="av-aviso av-aviso--erro mt-4" role="alert">{erro}</p>}
      {avisos.map((a) => (
        <p key={a} className="av-aviso av-aviso--atencao mt-3" role="status">{a}</p>
      ))}

      <h3 className="ata-subtitulo mt-8">1ª Parte</h3>
      <div className="ata-grade-2">
        <div className="av-campo">
          <label htmlFor="p1">Ata a aprovar</label>
          <textarea id="p1" rows={2} value={ata.primeiraParte} onChange={(e) => mudar((a) => ({ ...a, primeiraParte: e.target.value }))} placeholder="Apreciação e aprovação da Ata da 8ª Reunião Ordinária…" />
        </div>
        <div className="av-campo">
          <label htmlFor="p1r">Deliberação</label>
          <input id="p1r" value={ata.primeiraParteResultado} onChange={(e) => mudar((a) => ({ ...a, primeiraParteResultado: e.target.value }))} />
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 flex-wrap mt-6">
        <h3 className="ata-subtitulo">4ª Parte: Ordem do dia</h3>
        {ata.itens.some((i) => !i.resultado) && (
          <button
            type="button"
            className="av-btn av-btn--fantasma av-btn--pequeno"
            onClick={() => mudar((a) => ({ ...a, itens: a.itens.map((i) => (i.resultado ? i : { ...i, resultado: 'aprovado' })) }))}
          >
            Marcar como Aprovado os itens sem resultado
          </button>
        )}
      </div>
      {!ata.itens.length && <p className="text-texto-suave">Os processos aparecem aqui quando a pauta for lida. Também dá para incluir itens à mão.</p>}
      <ol className="ata-itens">
        {ata.itens.map((it, k) => (
          <li key={it.id} className="ata-item">
            <div className="ata-item-cabeca">
              <span className="ata-item-n">4.{k + 1}</span>
              <input aria-label={`Processo do item 4.${k + 1}`} className="ata-item-processo" value={it.processo} placeholder="Nº do processo (se houver)" onChange={(e) => setItem(it.id, { processo: e.target.value })} />
              <label className="ata-check">
                <input type="checkbox" checked={it.inclusao} onChange={(e) => setItem(it.id, { inclusao: e.target.checked })} /> Inclusão de pauta
              </label>
              <span className="ml-auto flex gap-1">
                <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => mover(k, -1)} disabled={k === 0} aria-label={`Subir o item 4.${k + 1}`}>
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => mover(k, 1)} disabled={k === ata.itens.length - 1} aria-label={`Descer o item 4.${k + 1}`}>
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="av-btn av-btn--fantasma av-btn--pequeno"
                  onClick={() => window.confirm(`Tirar o item 4.${k + 1} da ata?`) && mudar((a) => ({ ...a, itens: a.itens.filter((x) => x.id !== it.id) }))}
                  aria-label={`Tirar o item 4.${k + 1}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </span>
            </div>

            {it.campos.map((c, ci) => (
              <div key={ci} className="ata-campo-item">
                <input
                  aria-label="Rótulo"
                  className="ata-rotulo"
                  value={c.rotulo}
                  onChange={(e) => setItem(it.id, { campos: it.campos.map((x, j) => (j === ci ? { ...x, rotulo: e.target.value } : x)) })}
                />
                <textarea
                  aria-label={`${c.rotulo} do item 4.${k + 1}`}
                  rows={Math.min(6, Math.max(1, Math.ceil(c.valor.length / 95)))}
                  value={c.valor}
                  onChange={(e) => setItem(it.id, { campos: it.campos.map((x, j) => (j === ci ? { ...x, valor: e.target.value } : x)) })}
                />
              </div>
            ))}
            <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno mb-3" onClick={() => setItem(it.id, { campos: [...it.campos, { rotulo: 'Interessado', valor: '' }] })}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Campo
            </button>

            <fieldset className="ata-resultado">
              <legend>Resultado</legend>
              {RESULTADOS.map((r) => (
                <label key={r.valor} className="ata-opcao">
                  <input type="radio" name={`res-${it.id}`} checked={it.resultado === r.valor} onChange={() => setItem(it.id, { resultado: r.valor as Resultado })} />
                  {r.rotulo}
                </label>
              ))}
            </fieldset>
            <div className="ata-grade-2">
              <div className="av-campo">
                <label htmlFor={`obs-${it.id}`}>Observação</label>
                <input
                  id={`obs-${it.id}`}
                  value={it.observacao}
                  onChange={(e) => setItem(it.id, { observacao: e.target.value })}
                  placeholder={it.resultado === 'retirado' ? 'por falta de cadastro de processo no SIPAC' : it.resultado === 'aprovado_ressalva' ? 'ajuste no cronograma do projeto e no parecer' : ''}
                />
              </div>
              <fieldset className="ata-votos">
                <legend>Votos (deixe vazio se foi por unanimidade)</legend>
                {(['favoraveis', 'contrarios', 'abstencoes'] as const).map((v) => (
                  <label key={v}>
                    {v === 'favoraveis' ? 'Favoráveis' : v === 'contrarios' ? 'Contrários' : 'Abstenções'}
                    <input type="number" min={0} inputMode="numeric" value={it.votos[v] ?? ''} onChange={(e) => setItem(it.id, { votos: { ...it.votos, [v]: numero(e.target.value) } })} />
                  </label>
                ))}
              </fieldset>
            </div>
            <p className="text-[length:var(--av-texto-xs)] text-texto-suave">
              {it.parecer ? 'Parecer: voto copiado.' : 'Sem parecer.'} {it.discussao ? 'Discussão: redigida a partir da gravação.' : ''}
            </p>
          </li>
        ))}
      </ol>
      <button type="button" className="av-btn av-btn--secundario" onClick={() => mudar((a) => ({ ...a, itens: [...a.itens, itemVazio()] }))}>
        <Plus className="w-4 h-4" aria-hidden="true" /> Incluir item
      </button>
    </section>
  );
};
