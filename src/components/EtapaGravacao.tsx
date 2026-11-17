import React, { useRef, useState } from 'react';
import { Upload, Download } from 'lucide-react';
import { api, comNovaTentativa, emParalelo, enviarArquivo } from '../services/api';
import { ProcessandoOverlay, Progresso } from './ProcessandoOverlay';
import type { Ata, Config, ParteTranscrita } from '../tipos';
import { formatSecondsToTime, transcricaoCompleta } from '../utils/tempo';

interface Props {
  ata: Ata;
  config: Config;
  mudar: (fn: (a: Ata) => Ata) => void;
}

const EM_PARALELO = 5;

interface Corte {
  trabalho: string;
  duracaoSeg: number;
  partes: { n: number; inicioSeg: number; fimSeg: number }[];
}

/** Gravação da reunião: o servidor corta em partes de 15 min e o app transcreve 5 de cada vez. */
export const EtapaGravacao: React.FC<Props> = ({ ata, config, mudar }) => {
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [corte, setCorte] = useState<Corte | null>(null); // fica para tentar de novo as partes que falharem
  const cancelar = useRef<AbortController | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const nomes = config.grupos.flatMap((g) => g.membros.map((m) => m.nome));
  const feitas = ata.transcricao.partes;
  const faltam = corte ? corte.partes.filter((p) => !feitas.some((f) => f.n === p.n)) : [];

  const transcrever = async (c: Corte, quais: Corte['partes'], sinal: AbortSignal) => {
    const estados: Array<'espera' | 'atual' | 'feita'> = c.partes.map((p) => (feitas.some((f) => f.n === p.n) && !quais.includes(p) ? 'feita' : 'espera'));
    const total = c.partes.length;
    const mostrar = () => {
      const prontas = estados.filter((e) => e === 'feita').length;
      setProgresso({ etapa: 'Transcrevendo a reunião', detalhe: `${prontas} de ${total} partes prontas.`, parteAtual: 1, totalPartes: total, estados: [...estados] });
    };
    mostrar();
    const falhas: number[] = [];
    await emParalelo(
      quais.map((p) => async () => {
        estados[p.n - 1] = 'atual';
        mostrar();
        try {
          const r = await comNovaTentativa(() => api<{ texto: string }>('/api/transcrever-parte', { body: { trabalho: c.trabalho, parte: p.n, nomes }, signal: sinal }), 4);
          const nova: ParteTranscrita = { n: p.n, inicioSeg: p.inicioSeg, fimSeg: p.fimSeg, texto: r.texto };
          mudar((a) => ({
            ...a,
            transcricao: { ...a.transcricao, duracaoSeg: c.duracaoSeg, partes: [...a.transcricao.partes.filter((x) => x.n !== p.n), nova].sort((x, y) => x.n - y.n) },
          }));
          estados[p.n - 1] = 'feita';
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e;
          estados[p.n - 1] = 'espera';
          falhas.push(p.n);
        }
        mostrar();
      }),
      EM_PARALELO,
      sinal
    );
    return falhas;
  };

  const terminar = async (c: Corte, falhas: number[]) => {
    if (falhas.length) {
      setErro(`As partes ${falhas.sort((a, b) => a - b).join(', ')} não foram transcritas. Clique em "Tentar de novo as partes que faltaram".`);
      return;
    }
    setProgresso({ etapa: 'Guardando a gravação', detalhe: 'A versão comprimida fica guardada com a ata.', parteAtual: c.partes.length + 1, totalPartes: c.partes.length });
    try {
      await api(`/api/audio/${c.trabalho}/guardar`, { body: { ata: ata.id } });
      mudar((a) => ({ ...a, transcricao: { ...a.transcricao, arquivo: 'gravacao.mp3' } }));
    } catch {
      setErro('A transcrição ficou pronta, mas a gravação não foi guardada no servidor.');
    }
    await api(`/api/audio/${c.trabalho}`, { method: 'DELETE' }).catch(() => {});
    setCorte(null);
  };

  const enviar = async (f: File | undefined) => {
    if (!f) return;
    if (feitas.length && !window.confirm('Esta ata já tem uma transcrição. Enviar outra gravação substitui a atual. Continuar?')) return;
    setErro(null);
    const ctl = new AbortController();
    cancelar.current = ctl;
    try {
      setProgresso({ etapa: 'Enviando a gravação', detalhe: '0% enviado', parteAtual: 0, totalPartes: 1 });
      const c = await enviarArquivo<Corte>('/api/audio/cortar', f, {
        signal: ctl.signal,
        aoEnviar: (x) =>
          setProgresso({
            etapa: x < 1 ? 'Enviando a gravação' : 'Cortando em partes',
            detalhe: x < 1 ? `${Math.round(x * 100)}% enviado` : 'O servidor está convertendo e cortando o áudio.',
            parteAtual: 0,
            totalPartes: 1,
          }),
      });
      setCorte(c);
      mudar((a) => ({ ...a, transcricao: { partes: [], duracaoSeg: c.duracaoSeg, nomeOriginal: f.name } }));
      const falhas = await transcrever(c, c.partes, ctl.signal);
      await terminar(c, falhas);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setErro(e.message || 'Não foi possível transcrever a gravação.');
    } finally {
      setProgresso(null);
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  };

  const tentarDeNovo = async () => {
    if (!corte) return;
    setErro(null);
    const ctl = new AbortController();
    cancelar.current = ctl;
    try {
      const falhas = await transcrever(corte, faltam, ctl.signal);
      await terminar(corte, falhas);
    } catch (e: any) {
      if (e?.name !== 'AbortError') setErro(e.message);
    } finally {
      setProgresso(null);
    }
  };

  const texto = transcricaoCompleta(feitas);

  return (
    <section aria-labelledby="t-grav">
      <h2 id="t-grav" className="ata-subtitulo">Gravação da reunião</h2>
      <p className="text-texto-suave mb-4">
        Envie o áudio ou vídeo da reunião, de qualquer tamanho. O servidor corta em partes de 15 minutos, o app transcreve 5 partes ao mesmo tempo e junta tudo na ordem.
      </p>
      <label className="tr-soltar block">
        <input ref={arquivoRef} type="file" accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.opus,.webm,.mp4,.aac,.flac" className="sr-only" onChange={(e) => enviar(e.target.files?.[0])} />
        <Upload className="w-6 h-6 mx-auto mb-2" aria-hidden="true" />
        <span className="font-semibold">{feitas.length ? 'Enviar outra gravação' : 'Escolher a gravação'}</span>
        <span className="block text-[length:var(--av-texto-sm)] text-texto-suave">MP3, M4A, WAV, OGG, MP4 e outros</span>
      </label>

      {erro && (
        <div className="av-aviso av-aviso--erro mt-4" role="alert">
          <span className="av-aviso-icone" aria-hidden="true">!</span>
          <div>
            {erro}
            {faltam.length > 0 && (
              <div className="mt-2">
                <button type="button" className="av-btn av-btn--secundario av-btn--pequeno" onClick={tentarDeNovo}>Tentar de novo as partes que faltaram</button>
              </div>
            )}
          </div>
        </div>
      )}

      {feitas.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap mt-6 mb-2">
            <h3 className="ata-subtitulo !mb-0">Transcrição</h3>
            <span className="text-[length:var(--av-texto-sm)] text-texto-suave tabular">
              {feitas.length} partes · {formatSecondsToTime(ata.transcricao.duracaoSeg)} de gravação
              {ata.transcricao.arquivo && ata.id && (
                <>
                  {' · '}
                  <a className="underline" href={`/api/atas/${ata.id}/arquivo/${ata.transcricao.arquivo}`}>
                    <Download className="w-3.5 h-3.5 inline" aria-hidden="true" /> baixar o áudio
                  </a>
                </>
              )}
            </span>
          </div>
          <pre className="ata-transcricao" tabIndex={0} aria-label="Transcrição da reunião">{texto}</pre>
        </>
      )}

      {!feitas.length && (
        <div className="av-campo mt-6">
          <label htmlFor="com-manual">Sem gravação? Escreva aqui as comunicações e os informes</label>
          <textarea
            id="com-manual"
            rows={4}
            value={ata.comunicacoes}
            onChange={(e) => mudar((a) => ({ ...a, comunicacoes: e.target.value }))}
            placeholder="Ex.: O Diretor da FEF, Fulano, comunicou que no dia 30 de setembro ocorrerá a confraternização dos 20 anos da Faculdade. A TAE Fulana informou sobre o processo seletivo do PPGA."
          />
          <span className="text-[length:var(--av-texto-xs)] text-texto-suave">Entra na 2ª Parte da ata. As discussões de cada item podem ser escritas na etapa Ata.</span>
        </div>
      )}

      <div className="av-campo mt-6">
        <label htmlFor="retirar">O que deve ficar fora da ata (opcional)</label>
        <textarea
          id="retirar"
          rows={3}
          value={ata.retirar}
          onChange={(e) => mudar((a) => ({ ...a, retirar: e.target.value }))}
          placeholder="Ex.: a conversa sobre o ar-condicionado no início; os comentários pessoais sobre o item 4.21."
        />
        <span className="text-[length:var(--av-texto-xs)] text-texto-suave">
          Comunicações e informes entram resumidos. Escreva aqui o que deve sair, e a IA deixa de fora ao redigir.
        </span>
      </div>

      {progresso && <ProcessandoOverlay progresso={progresso} onCancelar={() => cancelar.current?.abort()} />}
    </section>
  );
};
