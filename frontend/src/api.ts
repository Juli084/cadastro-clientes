export interface Cliente {
  id: string;
  name: string;
  email: string;
  status: boolean;
  created_at: string;
}

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

const NOMES_DOS_CAMPOS: Record<string, string> = { name: 'nome', email: 'e-mail' };

export class ErroDaApi extends Error {}

async function pedir<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(BASE + caminho, opcoes);
  } catch {
    throw new ErroDaApi('Não foi possível falar com o servidor. Ele está rodando?');
  }

  if (resposta.status === 204) return undefined as T;

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const campos: string[] = corpo.campos ?? [];
    const detalhe = campos.length ? ` Confira: ${campos.map((c) => NOMES_DOS_CAMPOS[c] ?? c).join(', ')}.` : '';
    throw new ErroDaApi((corpo.erro ?? 'Algo deu errado.') + detalhe);
  }
  return corpo as T;
}

export const listarClientes = () => pedir<Cliente[]>('/customers');

export const cadastrarCliente = (dados: { name: string; email: string }) =>
  pedir<Cliente>('/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });

export const removerCliente = (id: string) => pedir<void>(`/customers/${encodeURIComponent(id)}`, { method: 'DELETE' });
