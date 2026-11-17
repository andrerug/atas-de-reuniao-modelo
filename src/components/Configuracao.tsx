import React, { useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import type { Config, Grupo, Membro } from '../tipos';
import { lerListaColada } from '../ata/lista';
import { api, enviarArquivo } from '../services/api';

interface Props {
  config: Config;
  salvar: (c: Config) => Promise<void>;
  fechar: () => void;
}

/** Dados que valem para todas as atas: cabeçalho, presidente, secretário e a lista de conselheiros. */
export const Configuracao: React.FC<Props> = ({ config, salvar, fechar }) => {
  const [c, setC] = useState<Config>(config);
  const [colado, setColado] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoBrasao, setEnviandoBrasao] = useState(false);

  const campo = (k: keyof Config) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.value });
  const mudarGrupo = (gi: number, g: Grupo) => setC({ ...c, grupos: c.grupos.map((x, i) => (i === gi ? g : x)) });
  const mudarMembro = (gi: number, mi: number, m: Partial<Membro>) =>
    mudarGrupo(gi, { ...c.grupos[gi], membros: c.grupos[gi].membros.map((x, i) => (i === mi ? { ...x, ...m } : x)) });

  const lerColado = () => {
    const g = lerListaColada(colado);
    if (!g.length) {
      setAviso('Não reconheci nenhum nome no texto colado. Copie a tabela da página do conselho, com as colunas Nome e Função.');
      return;
    }
    const total = g.reduce((s, x) => s + x.membros.length, 0);
    setC({ ...c, grupos: g });
    setColado('');
    setAviso(`${total} membros em ${g.length} grupos. Confira abaixo, corrija o que precisar e clique em Salvar.`);
  };

  const enviarBrasao = async (f: File | undefined) => {
    if (!f) return;
    setEnviandoBrasao(true);
    try {
      const r = await enviarArquivo<{ arquivo: string }>('/api/atas/config/brasao', f, { nome: f.name });
      setC({ ...c, brasao: r.arquivo });
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setEnviandoBrasao(false);
    }
  };

  const confirmar = async () => {
    setSalvando(true);
    try {
      await salvar({ ...c, cabecalho: c.cabecalho.map((l) => l.trim()).filter(Boolean) });
      fechar();
    } catch (e: any) {
      setAviso(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal
      titulo="Configuração"
      onFechar={fechar}
      larguraMax="max-w-4xl"
      rodape={
        <div className="flex justify-end gap-2">
          <button type="button" className="av-btn av-btn--secundario" onClick={fechar}>Cancelar</button>
          <button type="button" className="av-btn av-btn--primario" onClick={confirmar} disabled={salvando}>
            {salvando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Salvar
          </button>
        </div>
      }
    >
      <p className="text-texto-suave mb-5">Isto fica guardado no seu perfil e vale para todas as atas.</p>

      <h3 className="ata-subtitulo">Cabeçalho e encerramento</h3>
      <div className="ata-grade-2">
        <div className="av-campo">
          <label htmlFor="cab">Cabeçalho (uma linha por vez)</label>
          <textarea id="cab" rows={3} value={c.cabecalho.join('\n')} onChange={(e) => setC({ ...c, cabecalho: e.target.value.split('\n') })} />
        </div>
        <div className="av-campo">
          <label htmlFor="brasao">Brasão no topo da ata (PNG ou JPG)</label>
          <input id="brasao" type="file" accept="image/png,image/jpeg" onChange={(e) => enviarBrasao(e.target.files?.[0])} />
          <span className="text-[length:var(--av-texto-xs)] text-texto-suave">
            {enviandoBrasao ? 'Enviando…' : c.brasao ? `Guardado: ${c.brasao}` : 'Sem brasão. A ata sai só com o texto do cabeçalho.'}
          </span>
        </div>
        <div className="av-campo">
          <label htmlFor="conselho">Conselho</label>
          <input id="conselho" value={c.conselho} onChange={campo('conselho')} placeholder="Congregação" />
        </div>
        <div className="av-campo">
          <label htmlFor="inst">Unidade</label>
          <input id="inst" value={c.instituicao} onChange={campo('instituicao')} placeholder="Instituto de Ciências Exemplo" />
        </div>
        <div className="av-campo">
          <label htmlFor="sigla">Sigla</label>
          <input id="sigla" value={c.sigla} onChange={campo('sigla')} placeholder="IEX" />
        </div>
        <div className="av-campo">
          <label htmlFor="local">Local de costume</label>
          <input id="local" value={c.localPadrao} onChange={campo('localPadrao')} placeholder="Sala da Congregação" />
        </div>
        <div className="av-campo">
          <label htmlFor="pres">Quem preside</label>
          <div className="flex gap-2">
            <select aria-label="Tratamento" value={c.presidenteArtigo} onChange={campo('presidenteArtigo')} className="w-28">
              <option value="a">a Presidente</option>
              <option value="o">o Presidente</option>
            </select>
            <input id="pres" className="flex-1" value={c.presidente} onChange={campo('presidente')} placeholder="Nome completo" />
          </div>
        </div>
        <div className="av-campo">
          <label htmlFor="sec">Quem lavra a ata</label>
          <input id="sec" value={c.secretario} onChange={campo('secretario')} placeholder="Nome completo" />
        </div>
        <div className="av-campo">
          <label htmlFor="cargo">Cargo de quem lavra</label>
          <input id="cargo" value={c.cargoSecretario} onChange={campo('cargoSecretario')} placeholder="Técnico em Assuntos Educacionais" />
        </div>
      </div>

      <h3 className="ata-subtitulo">Lista de conselheiros</h3>
      <div className="av-campo">
        <label htmlFor="colar">Colar a lista da página do conselho</label>
        <textarea
          id="colar"
          rows={5}
          value={colado}
          onChange={(e) => setColado(e.target.value)}
          placeholder={'Copie a tabela da página do conselho e cole aqui. Ex.:\nFulana de Tal\tDiretora Geral\nCiclano (Titular)\nRepresentação dos Técnico-Administrativos\nBeltrana (Suplente)'}
        />
        <div>
          <button type="button" className="av-btn av-btn--secundario av-btn--pequeno mt-2" onClick={lerColado} disabled={!colado.trim()}>
            Ler a lista colada {c.grupos.length ? '(substitui a atual)' : ''}
          </button>
        </div>
      </div>
      {aviso && <p className="av-aviso mb-4" role="status">{aviso}</p>}

      {c.grupos.map((g, gi) => (
        <fieldset key={gi} className="ata-grupo">
          <legend className="sr-only">Grupo {g.grupo}</legend>
          <div className="flex gap-2 items-end mb-2">
            <div className="av-campo flex-1 !mb-0">
              <label htmlFor={`g${gi}`}>Grupo</label>
              <input id={`g${gi}`} value={g.grupo} onChange={(e) => mudarGrupo(gi, { ...g, grupo: e.target.value })} />
            </div>
            <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => setC({ ...c, grupos: c.grupos.filter((_, i) => i !== gi) })} aria-label={`Apagar o grupo ${g.grupo}`}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="ata-membros">
            {g.membros.map((m, mi) => (
              <div key={mi} className="ata-membro-linha">
                <input aria-label="Nome" value={m.nome} onChange={(e) => mudarMembro(gi, mi, { nome: e.target.value })} />
                <input aria-label="Cargo entre parênteses na ata" value={m.funcao || ''} placeholder="Cargo (opcional)" onChange={(e) => mudarMembro(gi, mi, { funcao: e.target.value })} />
                <select aria-label="Tipo" value={m.tipo} onChange={(e) => mudarMembro(gi, mi, { tipo: e.target.value as Membro['tipo'] })}>
                  <option value="nato">Membro nato</option>
                  <option value="titular">Titular</option>
                  <option value="suplente">Suplente</option>
                </select>
                {m.tipo === 'suplente' ? (
                  <select aria-label="Suplente de" value={m.suplenteDe || ''} onChange={(e) => mudarMembro(gi, mi, { suplenteDe: e.target.value })}>
                    <option value="">Suplente de…</option>
                    {c.grupos.flatMap((x) => x.membros).filter((x) => x.tipo !== 'suplente').map((x) => (
                      <option key={x.nome} value={x.nome}>{x.nome}</option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
                <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => mudarGrupo(gi, { ...g, membros: g.membros.filter((_, i) => i !== mi) })} aria-label={`Tirar ${m.nome}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno mt-1" onClick={() => mudarGrupo(gi, { ...g, membros: [...g.membros, { nome: '', tipo: 'titular' }] })}>
            <Plus className="w-4 h-4" aria-hidden="true" /> Membro
          </button>
        </fieldset>
      ))}
      <button type="button" className="av-btn av-btn--secundario av-btn--pequeno" onClick={() => setC({ ...c, grupos: [...c.grupos, { grupo: 'Novo grupo', membros: [] }] })}>
        <Plus className="w-4 h-4" aria-hidden="true" /> Grupo
      </button>

      <ChaveClaude />
    </Modal>
  );
};

/** Chave para o Claude usar o app pelo conector (MCP). Aparece uma vez só; depois fica só o registro de que existe. */
const ChaveClaude: React.FC = () => {
  const [info, setInfo] = useState<{ tem: boolean; criada: string | null } | null>(null);
  const [nova, setNova] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  React.useEffect(() => {
    api<{ tem: boolean; criada: string | null }>('/api/chave').then(setInfo).catch((e) => setErro(e.message));
  }, []);

  const gerar = async () => {
    if (info?.tem && !window.confirm('Gerar uma chave nova desliga a anterior. O Claude vai precisar da chave nova. Continuar?')) return;
    try {
      const r = await api<{ chave: string }>('/api/chave', { method: 'POST' });
      setNova(r.chave);
      setInfo({ tem: true, criada: new Date().toISOString() });
    } catch (e: any) {
      setErro(e.message);
    }
  };
  const apagar = async () => {
    if (!window.confirm('Apagar a chave? O Claude deixa de acessar as suas atas até você gerar outra.')) return;
    await api('/api/chave', { method: 'DELETE' }).catch((e) => setErro(e.message));
    setNova(null);
    setInfo({ tem: false, criada: null });
  };

  return (
    <>
      <h3 className="ata-subtitulo mt-8">Chave para o Claude</h3>
      <p className="text-texto-suave mb-3">
        Com esta chave, o Claude (pelo conector MCP de atas) lista, monta e baixa as suas atas. Ela dá acesso às suas atas: guarde como uma senha.
      </p>
      {erro && <p className="av-aviso av-aviso--erro mb-3" role="alert">{erro}</p>}
      {nova && (
        <div className="av-aviso av-aviso--sucesso mb-3" role="status">
          <div className="min-w-0">
            <strong>Copie agora. Ela não aparece de novo.</strong>
            <code className="block break-all my-2">{nova}</code>
            <button type="button" className="av-btn av-btn--secundario av-btn--pequeno" onClick={() => navigator.clipboard.writeText(nova)}>
              Copiar chave
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" className="av-btn av-btn--secundario av-btn--pequeno" onClick={gerar}>
          {info?.tem ? 'Gerar chave nova' : 'Gerar chave'}
        </button>
        {info?.tem && (
          <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={apagar}>
            Apagar chave
          </button>
        )}
        <span className="text-[length:var(--av-texto-xs)] text-texto-suave">
          {info?.tem && info.criada ? `Chave ativa, criada em ${new Date(info.criada).toLocaleString('pt-BR')}.` : 'Nenhuma chave ativa.'}
        </span>
      </div>
    </>
  );
};
