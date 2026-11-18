import { LockKeyhole } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, ErroDaApi, type Usuario } from '../api.ts';
import { BotaoPrincipal, Campo } from '../componentes/comuns.tsx';

/** Primeiro acesso (cria o dono da conta) ou login. */
export function Acesso({ configurado, onEntrar }: { configurado: boolean; onEntrar: (usuario: Usuario) => void }) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');
    if (!configurado && senha.length < 10) {
      setErro('Use uma senha com pelo menos 10 caracteres. Uma frase curta funciona bem.');
      return;
    }
    setOcupado(true);
    try {
      onEntrar(configurado ? await api.entrar({ email, senha }) : await api.configurar({ nome, email, senha }));
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : 'Não deu para entrar.');
      setOcupado(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <form onSubmit={enviar} className="w-full max-w-sm space-y-5 rounded-2xl border border-linha bg-cartao p-6 shadow-sm">
        <div>
          <span className="grid size-11 place-items-center rounded-xl bg-marca-claro text-marca">
            <LockKeyhole size={22} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">{configurado ? 'Entrar' : 'Criar a conta'}</h1>
          <p className="mt-1 text-sm text-suave">
            {configurado
              ? 'Carteira de clientes. Use o e-mail e a senha da sua conta.'
              : 'Primeiro acesso: este será o usuário dono da carteira de clientes.'}
          </p>
        </div>
        {!configurado ? (
          <Campo rotulo="Seu nome">
            {(props) => <input {...props} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required minLength={2} />}
          </Campo>
        ) : null}
        <Campo rotulo="E-mail">
          {(props) => (
            <input {...props} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          )}
        </Campo>
        <Campo rotulo="Senha" dica={configurado ? undefined : 'Pelo menos 10 caracteres.'}>
          {(props) => (
            <input
              {...props}
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={configurado ? 'current-password' : 'new-password'}
              required
            />
          )}
        </Campo>
        {erro ? (
          <p className="rounded-lg bg-atraso-claro px-3 py-2 text-sm text-atraso" role="alert">
            {erro}
          </p>
        ) : null}
        <div className="flex">
          <BotaoPrincipal ocupado={ocupado}>{configurado ? 'Entrar' : 'Criar e entrar'}</BotaoPrincipal>
        </div>
      </form>
    </main>
  );
}
