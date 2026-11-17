import { useEffect, useId, useState, type FormEvent } from 'react';
import { FiTrash } from 'react-icons/fi';
import { cadastrarCliente, listarClientes, removerCliente, type Cliente } from './api';

type Lista = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; clientes: Cliente[] };

const mensagemDe = (falha: unknown) => (falha instanceof Error ? falha.message : 'Algo deu errado.');

export default function App() {
  const [lista, setLista] = useState<Lista>({ tipo: 'carregando' });
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const idNome = useId();
  const idEmail = useId();

  useEffect(() => {
    let ignorar = false;
    listarClientes()
      .then((clientes) => {
        if (!ignorar) setLista({ tipo: 'ok', clientes });
      })
      .catch((falha) => {
        if (!ignorar) setLista({ tipo: 'erro', mensagem: mensagemDe(falha) });
      });
    return () => {
      ignorar = true;
    };
  }, []);

  async function cadastrar(event: FormEvent) {
    event.preventDefault();
    setAviso('');
    setEnviando(true);
    try {
      const novo = await cadastrarCliente({ name: nome, email });
      setLista((atual) => (atual.tipo === 'ok' ? { tipo: 'ok', clientes: [...atual.clientes, novo] } : atual));
      setNome('');
      setEmail('');
    } catch (falha) {
      setAviso(mensagemDe(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function remover(cliente: Cliente) {
    setAviso('');
    try {
      await removerCliente(cliente.id);
      setLista((atual) =>
        atual.tipo === 'ok' ? { tipo: 'ok', clientes: atual.clientes.filter((c) => c.id !== cliente.id) } : atual,
      );
    } catch (falha) {
      setAviso(mensagemDe(falha));
    }
  }

  return (
    <div className="w-full min-h-screen bg-gray-700 flex justify-center px-4">
      <main className="my-10 w-full md:max-w-2xl">
        <h1 className="text-4xl font-medium text-white">Clientes</h1>

        <form className="flex flex-col my-6" onSubmit={cadastrar}>
          <label htmlFor={idNome} className="font-medium text-white">
            Nome
          </label>
          <input
            id={idNome}
            type="text"
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
            placeholder="Nome completo"
            className="w-full mb-5 p-2 rounded bg-white"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
          />
          <label htmlFor={idEmail} className="font-medium text-white">
            E-mail
          </label>
          <input
            id={idEmail}
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="email@exemplo.com"
            className="w-full mb-5 p-2 rounded bg-white"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            type="submit"
            disabled={enviando}
            className="cursor-pointer w-full p-2 bg-green-400 rounded font-medium disabled:opacity-60"
          >
            {enviando ? 'Cadastrando...' : 'Cadastrar'}
          </button>
          {aviso && (
            <p role="alert" className="mt-4 rounded bg-red-100 p-2 text-red-800">
              {aviso}
            </p>
          )}
        </form>

        {lista.tipo === 'carregando' && (
          <p role="status" className="text-white">
            Carregando clientes...
          </p>
        )}
        {lista.tipo === 'erro' && (
          <p role="alert" className="rounded bg-red-100 p-2 text-red-800">
            {lista.mensagem}
          </p>
        )}
        {lista.tipo === 'ok' && lista.clientes.length === 0 && <p className="text-white">Nenhum cliente cadastrado.</p>}
        {lista.tipo === 'ok' && lista.clientes.length > 0 && (
          <ul className="flex flex-col gap-3">
            {lista.clientes.map((cliente) => (
              <li key={cliente.id} className="w-full bg-white rounded p-2 relative">
                <p>
                  <span className="font-medium">Nome: </span>
                  {cliente.name}
                </p>
                <p>
                  <span className="font-medium">E-mail: </span>
                  {cliente.email}
                </p>
                <p>
                  <span className="font-medium">Status: </span>
                  {cliente.status ? 'Ativo' : 'Inativo'}
                </p>
                <button
                  type="button"
                  aria-label={`Remover ${cliente.name}`}
                  className="bg-red-400 w-7 h-7 flex items-center justify-center rounded-lg absolute right-0 -top-2"
                  onClick={() => remover(cliente)}
                >
                  <FiTrash size={16} color="#fff" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
