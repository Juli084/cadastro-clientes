import { useState, type FormEvent } from 'react';
import { api, ErroDaApi, type Cliente, type DadosDoCliente, type Origem, type Situacao } from '../api.ts';
import { BotaoPrincipal, Campo } from '../componentes/comuns.tsx';
import { documento, NOMES_DE_ORIGEM, NOMES_DE_SITUACAO, telefone } from '../formatos.ts';

interface Props {
  cliente: Cliente | null;
  onSalvo: (cliente: Cliente) => void;
  onAbrirExistente: (id: string) => void;
}

const MENSAGENS: Record<string, string> = {
  nome: 'Digite o nome.',
  email: 'E-mail inválido.',
  telefone: 'Telefone com DDD, como (15) 99999-0000.',
  documento: 'CPF ou CNPJ inválido: confira os números.',
  proximoContato: 'Data inválida.',
};

export function FormularioDoCliente({ cliente, onSalvo, onAbrirExistente }: Props) {
  const [dados, setDados] = useState({
    nome: cliente?.nome ?? '',
    telefone: telefone(cliente?.telefone ?? null),
    email: cliente?.email ?? '',
    documento: documento(cliente?.documento ?? null),
    cidade: cliente?.cidade ?? '',
    origem: (cliente?.origem ?? '') as Origem | '',
    situacao: (cliente?.situacao ?? 'lead') as Situacao,
    etiquetas: cliente?.etiquetas.join(', ') ?? '',
    aceitaMensagens: cliente?.aceitaMensagens ?? false,
    observacoes: cliente?.observacoes ?? '',
    proximoContato: cliente?.proximoContato ?? '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState('');
  const [existente, setExistente] = useState<{ id: string; nome: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const mudar = <K extends keyof typeof dados>(campo: K, valor: (typeof dados)[K]) =>
    setDados((anterior) => ({ ...anterior, [campo]: valor }));

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setGeral('');
    setExistente(null);
    const corpo: Partial<DadosDoCliente> = {
      nome: dados.nome,
      telefone: dados.telefone || null,
      email: dados.email || null,
      documento: dados.documento || null,
      cidade: dados.cidade || null,
      origem: dados.origem || null,
      situacao: dados.situacao,
      etiquetas: dados.etiquetas.split(',').map((etiqueta) => etiqueta.trim()).filter(Boolean),
      aceitaMensagens: dados.aceitaMensagens,
      observacoes: dados.observacoes || null,
      proximoContato: dados.proximoContato || null,
    };
    setOcupado(true);
    try {
      onSalvo(cliente ? await api.atualizar(cliente.id, corpo) : await api.criar(corpo));
    } catch (falha) {
      if (falha instanceof ErroDaApi) {
        setErros(Object.fromEntries(falha.campos.map((campo) => [campo, MENSAGENS[campo] ?? 'Confira este campo.'])));
        setGeral(falha.message);
        setExistente(falha.existente);
      } else {
        setGeral('Não deu para salvar.');
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Campo rotulo="Nome" erro={erros.nome}>
          {(props) => <input {...props} value={dados.nome} onChange={(e) => mudar('nome', e.target.value)} maxLength={120} autoFocus />}
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="WhatsApp ou telefone" opcional erro={erros.telefone}>
            {(props) => (
              <input
                {...props}
                type="tel"
                inputMode="tel"
                placeholder="(15) 99999-0000"
                value={dados.telefone}
                onChange={(e) => mudar('telefone', e.target.value)}
              />
            )}
          </Campo>
          <Campo rotulo="E-mail" opcional erro={erros.email}>
            {(props) => <input {...props} type="email" value={dados.email} onChange={(e) => mudar('email', e.target.value)} />}
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="CPF ou CNPJ" opcional erro={erros.documento}>
            {(props) => <input {...props} inputMode="numeric" value={dados.documento} onChange={(e) => mudar('documento', e.target.value)} />}
          </Campo>
          <Campo rotulo="Cidade" opcional>
            {(props) => <input {...props} value={dados.cidade} onChange={(e) => mudar('cidade', e.target.value)} maxLength={80} />}
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Situação">
            {(props) => (
              <select {...props} value={dados.situacao} onChange={(e) => mudar('situacao', e.target.value as Situacao)}>
                {(Object.keys(NOMES_DE_SITUACAO) as Situacao[]).map((situacao) => (
                  <option key={situacao} value={situacao}>
                    {NOMES_DE_SITUACAO[situacao]}
                  </option>
                ))}
              </select>
            )}
          </Campo>
          <Campo rotulo="Como conheceu" opcional>
            {(props) => (
              <select {...props} value={dados.origem} onChange={(e) => mudar('origem', e.target.value as Origem | '')}>
                <option value="">Não informado</option>
                {(Object.keys(NOMES_DE_ORIGEM) as Origem[]).map((origem) => (
                  <option key={origem} value={origem}>
                    {NOMES_DE_ORIGEM[origem]}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </div>
        <Campo rotulo="Etiquetas" opcional dica="Separe por vírgula. Ex.: vip, revenda, iphone">
          {(props) => <input {...props} value={dados.etiquetas} onChange={(e) => mudar('etiquetas', e.target.value)} />}
        </Campo>
        <Campo rotulo="Próximo contato" opcional erro={erros.proximoContato}>
          {(props) => <input {...props} type="date" value={dados.proximoContato} onChange={(e) => mudar('proximoContato', e.target.value)} />}
        </Campo>
        <Campo rotulo="Observações" opcional>
          {(props) => (
            <textarea {...props} rows={3} value={dados.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} maxLength={2000} />
          )}
        </Campo>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={dados.aceitaMensagens}
            onChange={(e) => mudar('aceitaMensagens', e.target.checked)}
            className="mt-0.5 size-4 accent-marca"
          />
          <span>
            Aceita receber promoções e novidades
            <span className="block text-suave">Marque só com a autorização do cliente (LGPD).</span>
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-linha px-5 py-3">
        {geral ? (
          <p className="mr-auto text-sm text-atraso" role="alert">
            {geral}{' '}
            {existente ? (
              <button type="button" className="font-medium underline" onClick={() => onAbrirExistente(existente.id)}>
                Abrir cadastro
              </button>
            ) : null}
          </p>
        ) : null}
        <BotaoPrincipal ocupado={ocupado}>{cliente ? 'Salvar' : 'Cadastrar'}</BotaoPrincipal>
      </div>
    </form>
  );
}
