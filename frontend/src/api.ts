export type Situacao = 'lead' | 'cliente' | 'inativo';
export type Origem = 'instagram' | 'whatsapp' | 'indicacao' | 'google' | 'loja' | 'site' | 'outro';
export type TipoDeInteracao = 'nota' | 'ligacao' | 'whatsapp' | 'visita' | 'orcamento' | 'venda';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export interface Cliente {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  documento: string | null;
  cidade: string | null;
  origem: Origem | null;
  etiquetas: string[];
  situacao: Situacao;
  aceitaMensagens: boolean;
  observacoes: string | null;
  proximoContato: string | null;
  ultimoContato: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Interacao {
  id: string;
  tipo: TipoDeInteracao;
  texto: string;
  valor: number | null;
  autor: string;
  criadaEm: string;
}

export interface Pagina {
  itens: Cliente[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface Painel {
  total: number;
  porSituacao: Record<Situacao, number>;
  novosNoMes: number;
  retornosHoje: number;
  retornosAtrasados: number;
  vendasNoMes: { quantidade: number; valor: number };
}

export type DadosDoCliente = Omit<Cliente, 'id' | 'ultimoContato' | 'criadoEm' | 'atualizadoEm'>;

export class ErroDaApi extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly campos: string[] = [],
    readonly existente: { id: string; nome: string } | null = null,
  ) {
    super(mensagem);
  }
}

/** Chamado quando a sessão acaba, para a interface voltar à tela de login. */
let aoPerderSessao: () => void = () => {};
export function quandoPerderSessao(funcao: () => void) {
  aoPerderSessao = funcao;
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      ...opcoes,
      credentials: 'same-origin',
      headers: opcoes.body ? { 'content-type': 'application/json' } : {},
    });
  } catch {
    throw new ErroDaApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  }
  if (resposta.status === 204) return undefined as T;
  const corpo = (await resposta.json().catch(() => ({}))) as {
    erro?: string;
    campos?: string[];
    existente?: { id: string; nome: string };
  };
  if (!resposta.ok) {
    if (resposta.status === 401 && !caminho.startsWith('/auth/')) aoPerderSessao();
    throw new ErroDaApi(corpo.erro ?? 'Algo deu errado.', resposta.status, corpo.campos ?? [], corpo.existente ?? null);
  }
  return corpo as T;
}

const json = (corpo: unknown) => JSON.stringify(corpo);

export const api = {
  estado: () => pedir<{ configurado: boolean; usuario: Usuario | null }>('/auth/estado'),
  configurar: (dados: { nome: string; email: string; senha: string }) =>
    pedir<Usuario>('/auth/configurar', { method: 'POST', body: json(dados) }),
  entrar: (dados: { email: string; senha: string }) => pedir<Usuario>('/auth/entrar', { method: 'POST', body: json(dados) }),
  sair: () => pedir<void>('/auth/sair', { method: 'POST' }),

  painel: () => pedir<Painel>('/painel'),
  listar: (filtros: Record<string, string | number | undefined>) => {
    const parametros = new URLSearchParams();
    for (const [chave, valor] of Object.entries(filtros)) if (valor !== undefined && valor !== '') parametros.set(chave, String(valor));
    return pedir<Pagina>(`/clientes?${parametros}`);
  },
  cliente: (id: string) => pedir<Cliente & { interacoes: Interacao[] }>(`/clientes/${id}`),
  criar: (dados: Partial<DadosDoCliente>) => pedir<Cliente>('/clientes', { method: 'POST', body: json(dados) }),
  atualizar: (id: string, dados: Partial<DadosDoCliente>) =>
    pedir<Cliente>(`/clientes/${id}`, { method: 'PATCH', body: json(dados) }),
  excluir: (id: string) => pedir<void>(`/clientes/${id}`, { method: 'DELETE' }),
  registrar: (id: string, dados: { tipo: TipoDeInteracao; texto: string; valor: number | null; proximoContato?: string | null }) =>
    pedir<Interacao>(`/clientes/${id}/interacoes`, { method: 'POST', body: json(dados) }),
  apagarRegistro: (id: string, interacao: string) => pedir<void>(`/clientes/${id}/interacoes/${interacao}`, { method: 'DELETE' }),
};
