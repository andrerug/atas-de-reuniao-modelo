import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Moon, Sun, Settings, FilePlus2, FolderOpen, LogOut } from 'lucide-react';
import { api, quandoPerderSessao } from './services/api';
import { usarTema } from './utils/tema';
import { TelaSenha } from './components/TelaSenha';
import { Configuracao } from './components/Configuracao';
import { EtapaPresenca } from './components/EtapaPresenca';
import { EtapaGravacao } from './components/EtapaGravacao';
import { EtapaPauta } from './components/EtapaPauta';
import { EtapaPareceres } from './components/EtapaPareceres';
import { EtapaAta } from './components/EtapaAta';
import { ListaAtas } from './components/ListaAtas';
import { ATA_NOVA, Ata, CONFIG_INICIAL, Config } from './tipos';
import { dataCurta } from './ata/extenso';
import { presencaInicial } from './ata/aplicar';

interface SessaoInfo {
  logado: boolean;
  modo: 'conta' | 'senha';
  senhaConfigurada: boolean;
  enderecoConta?: string;
  usuario?: { nome: string; email: string; papel: string };
  saldo?: number | null;
}

const ETAPAS = [
  { id: 'presenca', nome: 'Presença' },
  { id: 'gravacao', nome: 'Gravação' },
  { id: 'pauta', nome: 'Pauta' },
  { id: 'pareceres', nome: 'Pareceres' },
  { id: 'ata', nome: 'Ata' },
] as const;
type Etapa = (typeof ETAPAS)[number]['id'];

export function tituloDaAta(a: Ata): string {
  const r = a.reuniao;
  if (!r.numero && !r.data) return 'Ata sem título';
  return `${r.numero ? `${r.numero}ª Reunião ${r.tipo || ''}`.trim() : 'Reunião'}${r.data ? ` de ${dataCurta(r.data)}` : ''}${a.status === 'pronta' ? '' : ' (rascunho)'}`;
}

export default function App() {
  const [tema, trocarTema] = usarTema();
  const [sessao, setSessao] = useState<SessaoInfo | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [ata, setAta] = useState<Ata | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('presenca');
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [salvo, setSalvo] = useState<'salvo' | 'salvando' | 'erro' | ''>('');
  const [erro, setErro] = useState<string | null>(null);
  const ultimoSalvo = useRef('');

  const lerSessao = useCallback(async () => {
    try {
      const s = await api<SessaoInfo>('/api/sessao');
      setSessao(s);
      if (s.logado) {
        const c = await api<{ config: Config | null }>('/api/config');
        setConfig({ ...CONFIG_INICIAL, ...(c.config || {}) });
      }
    } catch (e: any) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    quandoPerderSessao(() => setSessao((s) => (s ? { ...s, logado: false } : s)));
    lerSessao();
  }, [lerSessao]);

  // guarda a ata no servidor 1,2 s depois da última mudança
  useEffect(() => {
    if (!ata?.id) return;
    const json = JSON.stringify(ata);
    if (json === ultimoSalvo.current) return;
    setSalvo('salvando');
    const t = window.setTimeout(async () => {
      try {
        await api('/api/atas', { method: 'PUT', body: { id: ata.id, titulo: tituloDaAta(ata), dados: ata } });
        ultimoSalvo.current = json;
        setSalvo('salvo');
      } catch {
        setSalvo('erro');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [ata]);

  const salvarAgora = async (a: Ata) => {
    await api('/api/atas', { method: 'PUT', body: { id: a.id, titulo: tituloDaAta(a), dados: a } });
    ultimoSalvo.current = JSON.stringify(a);
    setSalvo('salvo');
  };

  const salvarConfig = async (c: Config) => {
    setConfig(c);
    await api('/api/config', { method: 'PUT', body: { config: c } });
  };

  const novaAta = async () => {
    if (!config) return;
    const a: Ata = { ...ATA_NOVA(config.localPadrao), presenca: presencaInicial(config) };
    const r = await api<{ id: string }>('/api/atas', { method: 'PUT', body: { titulo: tituloDaAta(a), dados: a } });
    a.id = r.id;
    ultimoSalvo.current = JSON.stringify(a);
    setAta(a);
    setEtapa('presenca');
    setMostrarLista(false);
  };

  const abrirAta = async (id: string) => {
    const r = await api<{ dados: Ata }>(`/api/atas/${id}`);
    const a = { ...ATA_NOVA(), ...r.dados, id };
    ultimoSalvo.current = JSON.stringify(a);
    setAta(a);
    setEtapa('presenca');
    setMostrarLista(false);
  };

  const sair = async () => {
    await api('/api/sair', { method: 'POST' }).catch(() => {});
    setAta(null);
    setSessao((s) => (s ? { ...s, logado: false } : s));
  };

  if (!sessao) {
    return (
      <main className="tr-login" aria-busy="true">
        {erro ? <p className="av-aviso av-aviso--erro">{erro}</p> : <Loader2 className="w-8 h-8 animate-spin text-texto-suave" aria-label="Carregando" />}
      </main>
    );
  }
  if (!sessao.logado) {
    return <TelaSenha onEntrou={lerSessao} senhaConfigurada={sessao.senhaConfigurada} modo={sessao.modo} enderecoConta={sessao.enderecoConta} />;
  }
  if (!config) return null;

  const mudar = (fn: (a: Ata) => Ata) => setAta((a) => (a ? fn(a) : a));
  const semLista = config.grupos.length === 0;

  return (
    <div className="min-h-screen">
      <header className="ata-topo no-print">
        <div className="ata-topo-dentro">
          <button type="button" className="ata-marca" onClick={() => setAta(null)}>
            <span className="ata-simbolo" aria-hidden="true" />
            Atas de Reunião
          </button>
          <nav className="flex items-center gap-1 flex-wrap" aria-label="Ações">
            <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={novaAta}>
              <FilePlus2 className="w-4 h-4" aria-hidden="true" /> Nova ata
            </button>
            <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => setMostrarLista(true)}>
              <FolderOpen className="w-4 h-4" aria-hidden="true" /> Atas salvas
            </button>
            <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={() => setMostrarConfig(true)}>
              <Settings className="w-4 h-4" aria-hidden="true" /> Configuração
            </button>
            <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={trocarTema} aria-label={tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {tema === 'dark' ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
            </button>
            {sessao.modo === 'conta' && (
              <button type="button" className="av-btn av-btn--fantasma av-btn--pequeno" onClick={sair} title={sessao.usuario?.email}>
                <LogOut className="w-4 h-4" aria-hidden="true" /> Sair
              </button>
            )}
          </nav>
        </div>
      </header>

      <main id="conteudo" className="ata-pagina">
        {!ata ? (
          <section className="ata-inicio">
            <h1 className="tr-titulo text-[length:var(--av-titulo-2)] mb-3">Ata da reunião em cinco passos</h1>
            <ol className="ata-passos-inicio">
              <li><strong>Presença.</strong> A lista do conselho aparece com os titulares marcados. Desmarque quem faltou e anote a justificativa.</li>
              <li><strong>Gravação.</strong> Envie o áudio da reunião. Ele é cortado em partes de 15 minutos e transcrito 5 partes de cada vez.</li>
              <li><strong>Pauta.</strong> Envie a convocação em PDF ou Word. Cada processo ganha o campo de resultado e de observação.</li>
              <li><strong>Pareceres.</strong> Envie os pareceres. O voto, que é a parte final, entra na ata do jeito que está escrito.</li>
              <li><strong>Ata.</strong> Um clique redige comunicações e discussões a partir da gravação e gera o Word.</li>
            </ol>
            {semLista && (
              <div className="av-aviso av-aviso--atencao mb-5" role="status">
                <span className="av-aviso-icone" aria-hidden="true">!</span>
                <div>
                  <strong>Cadastre a lista de conselheiros primeiro.</strong> Em Configuração, cole a lista da página do conselho. Ela fica guardada no seu perfil.
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              {semLista ? (
                <button type="button" className="av-btn av-btn--primario" onClick={() => setMostrarConfig(true)}>
                  <Settings className="w-5 h-5" aria-hidden="true" /> Abrir Configuração
                </button>
              ) : (
                <button type="button" className="av-btn av-btn--primario" onClick={novaAta}>
                  <FilePlus2 className="w-5 h-5" aria-hidden="true" /> Começar uma ata
                </button>
              )}
              <button type="button" className="av-btn av-btn--secundario" onClick={() => setMostrarLista(true)}>
                <FolderOpen className="w-5 h-5" aria-hidden="true" /> Abrir ata salva
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="ata-cabeca-ata">
              <h1 className="tr-titulo text-[length:var(--av-titulo-3)]">{tituloDaAta(ata)}</h1>
              <span className="text-[length:var(--av-texto-sm)] text-texto-suave" role="status" aria-live="polite">
                {salvo === 'salvando' ? 'Salvando…' : salvo === 'salvo' ? (ata.status === 'pronta' ? 'Ata pronta, salva no app' : 'Rascunho salvo no app') : salvo === 'erro' ? 'Não salvou. Confira a internet.' : ''}
              </span>
            </div>
            <nav className="ata-etapas no-print" aria-label="Etapas da ata">
              {ETAPAS.map((e, i) => (
                <button key={e.id} type="button" className="ata-etapa" aria-current={etapa === e.id ? 'step' : undefined} onClick={() => setEtapa(e.id)}>
                  <span className="ata-etapa-n" aria-hidden="true">{i + 1}</span>
                  {e.nome}
                </button>
              ))}
            </nav>

            {etapa === 'presenca' && <EtapaPresenca ata={ata} config={config} mudar={mudar} abrirConfig={() => setMostrarConfig(true)} />}
            {etapa === 'gravacao' && <EtapaGravacao ata={ata} config={config} mudar={mudar} />}
            {etapa === 'pauta' && <EtapaPauta ata={ata} mudar={mudar} />}
            {etapa === 'pareceres' && <EtapaPareceres ata={ata} mudar={mudar} />}
            {etapa === 'ata' && <EtapaAta ata={ata} config={config} mudar={mudar} salvarAgora={salvarAgora} />}

            <div className="ata-navegar no-print">
              {ETAPAS.findIndex((e) => e.id === etapa) > 0 && (
                <button type="button" className="av-btn av-btn--secundario" onClick={() => setEtapa(ETAPAS[ETAPAS.findIndex((e) => e.id === etapa) - 1].id)}>
                  Voltar
                </button>
              )}
              {etapa !== 'ata' && (
                <button type="button" className="av-btn av-btn--primario" onClick={() => setEtapa(ETAPAS[ETAPAS.findIndex((e) => e.id === etapa) + 1].id)}>
                  Próximo: {ETAPAS[ETAPAS.findIndex((e) => e.id === etapa) + 1].nome}
                </button>
              )}
            </div>
          </>
        )}
      </main>

      {mostrarConfig && <Configuracao config={config} salvar={salvarConfig} fechar={() => setMostrarConfig(false)} />}
      {mostrarLista && <ListaAtas abrir={abrirAta} fechar={() => setMostrarLista(false)} atual={ata?.id} aoApagar={(id) => ata?.id === id && setAta(null)} />}
    </div>
  );
}
