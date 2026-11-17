import React, { useMemo, useState } from 'react';
import { FileDown, Loader2, Sparkles, Copy, Save } from 'lucide-react';
import { api } from '../services/api';
import type { Ata, Config } from '../tipos';
import { montarAta, textoSimples } from '../ata/montar';
import { gerarDocx } from '../ata/docx';
import { Redacao, aplicarRedacao, nomeArquivoDocx, pedidoRedacao } from '../ata/aplicar';

interface Props {
  ata: Ata;
  config: Config;
  mudar: (fn: (a: Ata) => Ata) => void;
  salvarAgora: (a: Ata) => Promise<void>;
}

/** Última etapa: redação das partes faladas, prévia e o .docx. */
export const EtapaAta: React.FC<Props> = ({ ata, config, mudar, salvarAgora }) => {
  const [salvando, setSalvando] = useState(false);
  const [redigindo, setRedigindo] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const montada = useMemo(() => montarAta(ata, config), [ata, config]);
  const temGravacao = ata.transcricao.partes.length > 0;

  const redigir = async () => {
    const jaTem = ata.comunicacoes || ata.proposicoes || ata.itens.some((i) => i.discussao);
    if (jaTem && !window.confirm('Redigir de novo troca as comunicações, as proposições e as discussões que já estão escritas. Continuar?')) return;
    setRedigindo(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await api<Redacao>('/api/redigir', { body: pedidoRedacao(ata, config) });
      const { marcados, extras } = aplicarRedacao(ata, r);
      mudar((atual) => aplicarRedacao(atual, r).ata);
      setAviso(
        `Pronto. Confira o texto abaixo.${marcados ? ` ${marcados} resultado(s) foram marcados pelo que se ouviu na gravação.` : ''}${
          extras ? ` ${extras} item(ns) incluído(s) na hora foram acrescentados no fim da Ordem do dia; confira na etapa Pauta.` : ''
        }`
      );
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setRedigindo(false);
    }
  };

  const baixar = async () => {
    setGerando(true);
    setErro(null);
    try {
      let brasao: { dados: ArrayBuffer; tipo: 'png' | 'jpg' } | undefined;
      if (config.brasao) {
        const r = await fetch(`/api/atas/config/arquivo/${config.brasao}`, { credentials: 'same-origin' });
        if (r.ok) brasao = { dados: await r.arrayBuffer(), tipo: /\.png$/i.test(config.brasao) ? 'png' : 'jpg' };
      }
      const blob = await gerarDocx(montada, brasao);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeArquivoDocx(ata);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      setErro(`Não foi possível gerar o Word: ${e.message}`);
    } finally {
      setGerando(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const pronta = { ...ata, status: 'pronta' as const, salvaEm: new Date().toISOString() };
      await salvarAgora(pronta);
      mudar(() => pronta);
      setAviso('Ata salva no app. Ela fica em Atas salvas, com a pauta, os pareceres e a gravação.');
    } catch (e: any) {
      setErro(`Não salvou: ${e.message}`);
    } finally {
      setSalvando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoSimples(montada));
      setAviso('Texto da ata copiado.');
    } catch {
      setErro('O navegador não deixou copiar. Selecione o texto da prévia e copie.');
    }
  };

  return (
    <section aria-labelledby="t-ata">
      <h2 id="t-ata" className="ata-subtitulo">Ata</h2>

      <div className="flex flex-wrap gap-3 mb-4 no-print">
        <button type="button" className="av-btn av-btn--secundario" onClick={redigir} disabled={redigindo || !temGravacao}>
          {redigindo ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Sparkles className="w-5 h-5" aria-hidden="true" />}
          {redigindo ? 'Redigindo a partir da gravação…' : ata.redigidaEm ? 'Redigir de novo com a gravação' : 'Redigir com a gravação'}
        </button>
        <button type="button" className="av-btn av-btn--primario" onClick={baixar} disabled={gerando}>
          {gerando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <FileDown className="w-5 h-5" aria-hidden="true" />}
          Baixar a ata em Word
        </button>
        <button type="button" className="av-btn av-btn--fantasma" onClick={copiar}>
          <Copy className="w-5 h-5" aria-hidden="true" /> Copiar texto
        </button>
      </div>
      {!temGravacao && <p className="text-texto-suave mb-4">Sem gravação: escreva as comunicações, os informes e as discussões nos campos abaixo.</p>}
      {erro && <p className="av-aviso av-aviso--erro mb-4" role="alert">{erro}</p>}
      {aviso && <p className="av-aviso av-aviso--sucesso mb-4" role="status">{aviso}</p>}
      {montada.pendencias.length > 0 && (
        <div className="av-aviso av-aviso--atencao mb-6" role="status">
          <span className="av-aviso-icone" aria-hidden="true">!</span>
          <div>
            <strong>Falta preencher:</strong> {montada.pendencias.join('; ')}. No Word, o que falta sai marcado em amarelo.
          </div>
        </div>
      )}

      <details className="ata-ajustes no-print" open={Boolean(ata.redigidaEm) || !temGravacao}>
        <summary>{temGravacao ? 'Textos que vêm da gravação (comunicações, proposições e discussões)' : 'Comunicações, informes, proposições e discussões (escreva aqui)'}</summary>
        <div className="av-campo mt-4">
          <label htmlFor="com">2ª Parte: Comunicações e informes</label>
          <textarea id="com" rows={4} placeholder="Ex.: O Diretor da FEF, Fulano, comunicou que no dia 30 de setembro ocorrerá a confraternização dos 20 anos da Faculdade." value={ata.comunicacoes} onChange={(e) => mudar((a) => ({ ...a, comunicacoes: e.target.value }))} />
        </div>
        <div className="av-campo">
          <label htmlFor="prop">3ª Parte: Proposições e indicações</label>
          <textarea id="prop" rows={3} value={ata.proposicoes} onChange={(e) => mudar((a) => ({ ...a, proposicoes: e.target.value }))} />
        </div>
        {ata.itens.map((it, k) => (
          <div className="av-campo" key={it.id}>
            <label htmlFor={`d-${it.id}`}>
              Discussão do item 4.{k + 1} <span className="font-normal text-texto-suave">{(it.campos.find((c) => /assunto/i.test(c.rotulo))?.valor || '').slice(0, 80)}</span>
            </label>
            <textarea id={`d-${it.id}`} rows={it.discussao ? 3 : 1} value={it.discussao} onChange={(e) => mudar((a) => ({ ...a, itens: a.itens.map((x) => (x.id === it.id ? { ...x, discussao: e.target.value } : x)) }))} />
          </div>
        ))}
      </details>

      <h3 className="ata-subtitulo mt-8">Prévia</h3>
      <article className="ata-folha" aria-label="Prévia da ata">
        {montada.cabecalho.map((l) => (
          <p key={l} className="ata-folha-cab">{l}</p>
        ))}
        <p className="ata-folha-titulo">{montada.titulo}</p>
        <p className="ata-folha-corpo">
          {montada.corpo.map((t, i) =>
            t.falta ? (
              <mark key={i}>{t.t}</mark>
            ) : t.b ? (
              <strong key={i}>{t.t}</strong>
            ) : (
              <React.Fragment key={i}>{t.t}</React.Fragment>
            )
          )}
        </p>
      </article>

      <div className="ata-final no-print">
        <button type="button" className="av-btn av-btn--secundario" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Save className="w-5 h-5" aria-hidden="true" />}
          Salvar no app
        </button>
        <button type="button" className="av-btn av-btn--primario" onClick={baixar} disabled={gerando}>
          {gerando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <FileDown className="w-5 h-5" aria-hidden="true" />}
          Baixar a ata em Word
        </button>
      </div>
      {ata.status === 'pronta' && ata.salvaEm && (
        <p className="text-[length:var(--av-texto-sm)] text-texto-suave text-right mt-2">Salva no app em {new Date(ata.salvaEm).toLocaleString('pt-BR')}.</p>
      )}
    </section>
  );
};
