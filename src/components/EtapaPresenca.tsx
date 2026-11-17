import React from 'react';
import type { Ata, Config, Presenca } from '../tipos';

interface Props {
  ata: Ata;
  config: Config;
  mudar: (fn: (a: Ata) => Ata) => void;
  abrirConfig: () => void;
}

const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Dados da reunião e lista de presença (titulares vêm marcados; desmarque quem faltou). */
export const EtapaPresenca: React.FC<Props> = ({ ata, config, mudar, abrirConfig }) => {
  const r = ata.reuniao;
  const setR = (k: keyof Ata['reuniao'], v: string) =>
    mudar((a) => {
      const reuniao = { ...a.reuniao, [k]: v };
      if (k === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(v)) reuniao.diaSemana = SEMANA[new Date(v + 'T12:00:00').getDay()];
      return { ...a, reuniao };
    });
  const pres = (nome: string): Presenca => ata.presenca[nome] || { presente: false, justificativa: '' };
  const setP = (nome: string, p: Partial<Presenca>) => mudar((a) => ({ ...a, presenca: { ...a.presenca, [nome]: { ...pres(nome), ...p } } }));

  const todos = config.grupos.flatMap((g) => g.membros);
  const nPres = todos.filter((m) => pres(m.nome).presente).length;

  return (
    <section aria-labelledby="t-presenca">
      <h2 id="t-presenca" className="ata-subtitulo">Reunião</h2>
      <div className="ata-grade-reuniao">
        <div className="av-campo">
          <label htmlFor="num">Número</label>
          <input id="num" inputMode="numeric" value={r.numero} onChange={(e) => setR('numero', e.target.value.replace(/\D/g, ''))} placeholder="9" />
        </div>
        <div className="av-campo">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" value={r.tipo} onChange={(e) => setR('tipo', e.target.value)}>
            <option>Ordinária</option>
            <option>Extraordinária</option>
          </select>
        </div>
        <div className="av-campo">
          <label htmlFor="data">Data</label>
          <input id="data" type="date" value={r.data} onChange={(e) => setR('data', e.target.value)} />
        </div>
        <div className="av-campo">
          <label htmlFor="hora">Início</label>
          <input id="hora" type="time" value={r.hora} onChange={(e) => setR('hora', e.target.value)} />
        </div>
        <div className="av-campo ata-col-2">
          <label htmlFor="localr">Local</label>
          <input id="localr" value={r.local} onChange={(e) => setR('local', e.target.value)} placeholder={config.localPadrao} />
        </div>
      </div>
      <p className="text-[length:var(--av-texto-sm)] text-texto-suave mb-6">Ao enviar a pauta, estes campos são preenchidos com o que estiver nela.</p>

      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="ata-subtitulo">Presença</h2>
        <span className="text-texto-suave tabular" aria-live="polite">{nPres} presentes de {todos.length}</span>
      </div>
      {!todos.length ? (
        <div className="av-aviso av-aviso--atencao" role="status">
          <span className="av-aviso-icone" aria-hidden="true">!</span>
          <div>
            A lista de conselheiros está vazia.{' '}
            <button type="button" className="underline font-semibold" onClick={abrirConfig}>Abrir Configuração</button> e colar a lista.
          </div>
        </div>
      ) : (
        config.grupos.map((g) => (
          <fieldset key={g.grupo} className="ata-grupo">
            <legend className="ata-grupo-nome">{g.grupo}</legend>
            {g.membros.map((m) => {
              const p = pres(m.nome);
              const idc = `p-${m.nome.replace(/\W+/g, '-')}`;
              return (
                <div key={m.nome} className={`ata-presenca${p.presente ? '' : m.tipo === 'suplente' ? ' is-suplente-fora' : ' is-ausente'}`}>
                  <label htmlFor={idc} className="ata-presenca-nome">
                    <input id={idc} type="checkbox" checked={p.presente} onChange={(e) => setP(m.nome, { presente: e.target.checked })} />
                    <span>
                      {m.nome}
                      <span className="ata-presenca-papel">
                        {m.funcao || (m.tipo === 'suplente' ? `Suplente${m.suplenteDe ? ` de ${m.suplenteDe}` : ''}` : m.tipo === 'titular' ? 'Titular' : '')}
                      </span>
                    </span>
                  </label>
                  {!p.presente && m.tipo !== 'suplente' && (
                    <input
                      aria-label={`Justificativa da falta de ${m.nome}`}
                      className="ata-justificativa"
                      placeholder="Justificativa da falta (opcional)"
                      value={p.justificativa}
                      onChange={(e) => setP(m.nome, { justificativa: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
          </fieldset>
        ))
      )}
    </section>
  );
};
