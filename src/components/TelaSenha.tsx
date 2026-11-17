import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface TelaSenhaProps {
  onEntrou: () => void;
  senhaConfigurada: boolean;
  modo: 'conta' | 'senha';
  enderecoConta?: string;
}

/** Entrada: conta do laboratório (e-mail e senha) ou, no modo antigo, só a senha do app. */
export const TelaSenha: React.FC<TelaSenhaProps> = ({ onEntrou, senhaConfigurada, modo, enderecoConta }) => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);
  const conta = modo === 'conta';

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senha || (conta && !email)) {
      setErro(conta ? 'Preencha e-mail e senha.' : 'Digite a senha.');
      return;
    }
    setEntrando(true);
    setErro(null);
    try {
      await api('/api/entrar', { body: conta ? { email, senha } : { senha } });
      setSenha('');
      onEntrou();
    } catch (err: any) {
      setErro(err.message || 'Não foi possível entrar.');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <main className="tr-login">
      <div className="tr-login-caixa">
        <div className="tr-simbolo tr-simbolo--grande" aria-hidden="true">
          <span />
        </div>
        <h1 className="tr-login-titulo">Atas de Reunião</h1>
        <p className="text-texto-suave mb-6">
          Lista de presença, gravação, pauta e pareceres viram a ata pronta em Word.
        </p>

        {!senhaConfigurada ? (
          <div className="av-aviso av-aviso--atencao" role="status">
            <span className="av-aviso-icone" aria-hidden="true">!</span>
            <div>
              <strong>A senha ainda não foi criada</strong>
              Rode <code>bash vps/configurar.sh</code> na VPS para criar a senha e cadastrar a chave do Gemini.
            </div>
          </div>
        ) : (
          <form onSubmit={entrar} noValidate>
            {conta && (
              <div className="av-campo">
                <label htmlFor="email">E-mail da conta do laboratório</label>
                <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              </div>
            )}
            <div className="av-campo">
              <label htmlFor="senha">{conta ? 'Senha' : 'Senha do app'}</label>
              <input
                id="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                aria-invalid={erro ? 'true' : undefined}
                aria-describedby={erro ? 'senha-erro' : undefined}
                autoFocus={!conta}
              />
              {erro && (
                <span id="senha-erro" className="av-erro-msg" role="alert">
                  {erro}
                </span>
              )}
            </div>
            <button type="submit" className="av-btn av-btn--primario w-full" disabled={entrando}>
              {entrando ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : null}
              {entrando ? 'Entrando' : 'Entrar'}
            </button>
            {conta && (
              <p className="mt-4 text-[length:var(--av-texto-sm)] text-texto-suave">
                É a mesma conta de{' '}
                <a className="text-primaria font-semibold underline underline-offset-4" href={enderecoConta || 'https://seu-dominio.exemplo/conta/'}>
                  seu-dominio.exemplo/conta
                </a>
                , onde você vê o saldo e o histórico. Contas são criadas pelo professor.
              </p>
            )}
          </form>
        )}
        <p className="tr-login-rodape">Laboratório de IA · seu-dominio.exemplo</p>
      </div>
    </main>
  );
};
