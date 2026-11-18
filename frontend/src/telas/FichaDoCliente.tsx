import { CalendarClock, Mail, MessageCircle, Pencil, Phone, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ErroDaApi, type Cliente, type Interacao, type TipoDeInteracao } from '../api.ts';
import { BotaoPrincipal, Campo, Selo } from '../componentes/comuns.tsx';
import {
  data,
  dataEHora,
  documento,
  hoje,
  lerValor,
  linkDoWhatsApp,
  NOMES_DE_INTERACAO,
  NOMES_DE_ORIGEM,
  NOMES_DE_SITUACAO,
  reais,
  retorno,
  somarDias,
  telefone,
} from '../formatos.ts';

interface Props {
  id: string;
  onEditar: (cliente: Cliente) => void;
  onAlterado: () => void;
  onExcluido: () => void;
}

const ATALHOS = [
  { rotulo: 'Amanhã', dias: 1 },
  { rotulo: 'Em 3 dias', dias: 3 },
  { rotulo: 'Em 1 semana', dias: 7 },
  { rotulo: 'Em 1 mês', dias: 30 },
];

export function FichaDoCliente({ id, onEditar, onAlterado, onExcluido }: Props) {
  const [cliente, setCliente] = useState<(Cliente & { interacoes: Interacao[] }) | null>(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState<TipoDeInteracao>('whatsapp');
  const [texto, setTexto] = useState('');
  const [valor, setValor] = useState('');
  const [proximo, setProximo] = useState('');
  const [erroRegistro, setErroRegistro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setCliente(await api.cliente(id));
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.message : 'Não deu para abrir o cliente.');
    }
  }, [id]);

  useEffect(() => {
    let cancelado = false;
    api
      .cliente(id)
      .then((encontrado) => {
        if (!cancelado) setCliente(encontrado);
      })
      .catch((falha: unknown) => {
        if (!cancelado) setErro(falha instanceof ErroDaApi ? falha.message : 'Não deu para abrir o cliente.');
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    setErroRegistro('');
    const temValor = tipo === 'orcamento' || tipo === 'venda';
    const centavos = temValor && valor.trim() ? lerValor(valor) : null;
    if (temValor && valor.trim() && centavos === null) {
      setErroRegistro('Valor inválido. Use 150 ou 150,90.');
      return;
    }
    if (!texto.trim()) {
      setErroRegistro('Escreva o que aconteceu.');
      return;
    }
    setOcupado(true);
    try {
      await api.registrar(id, { tipo, texto, valor: centavos, ...(proximo ? { proximoContato: proximo } : {}) });
      setTexto('');
      setValor('');
      setProximo('');
      await carregar();
      onAlterado();
    } catch (falha) {
      setErroRegistro(falha instanceof ErroDaApi ? falha.message : 'Não deu para registrar.');
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    if (!cliente) return;
    const confirmado = window.confirm(
      `Excluir ${cliente.nome} e todo o histórico? Isso não pode ser desfeito.`,
    );
    if (!confirmado) return;
    await api.excluir(cliente.id);
    onExcluido();
  }

  async function apagarRegistro(interacao: Interacao) {
    if (!window.confirm('Apagar este registro do histórico?')) return;
    await api.apagarRegistro(id, interacao.id);
    await carregar();
    onAlterado();
  }

  if (erro) return <p className="p-5 text-atraso">{erro}</p>;
  if (!cliente) return <p className="p-5 text-suave">Carregando...</p>;

  const proximoContato = cliente.proximoContato ? retorno(cliente.proximoContato) : null;

  return (
    <div className="flex-1 overflow-y-auto">
      <section className="space-y-3 px-5 py-4">
        <p className="text-xl font-bold">{cliente.nome}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Selo texto={NOMES_DE_SITUACAO[cliente.situacao]} tom={cliente.situacao === 'cliente' ? 'marca' : 'neutro'} />
          {cliente.etiquetas.map((etiqueta) => (
            <Selo key={etiqueta} texto={etiqueta} tom="neutro" />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {cliente.telefone ? (
            <>
              <a
                href={linkDoWhatsApp(cliente.telefone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-marca px-3 text-sm font-semibold text-white"
              >
                <MessageCircle size={17} aria-hidden="true" />
                WhatsApp
              </a>
              <a href={`tel:+${cliente.telefone}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-linha px-3 text-sm">
                <Phone size={17} aria-hidden="true" />
                {telefone(cliente.telefone)}
              </a>
            </>
          ) : null}
          {cliente.email ? (
            <a href={`mailto:${cliente.email}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-linha px-3 text-sm">
              <Mail size={17} aria-hidden="true" />
              {cliente.email}
            </a>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {cliente.documento ? (
            <div>
              <dt className="text-suave">CPF/CNPJ</dt>
              <dd>{documento(cliente.documento)}</dd>
            </div>
          ) : null}
          {cliente.cidade ? (
            <div>
              <dt className="text-suave">Cidade</dt>
              <dd>{cliente.cidade}</dd>
            </div>
          ) : null}
          {cliente.origem ? (
            <div>
              <dt className="text-suave">Como conheceu</dt>
              <dd>{NOMES_DE_ORIGEM[cliente.origem]}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-suave">Promoções</dt>
            <dd>{cliente.aceitaMensagens ? 'Aceita receber' : 'Não autorizou'}</dd>
          </div>
          <div>
            <dt className="text-suave">Próximo contato</dt>
            <dd className={proximoContato?.estado === 'atrasado' ? 'font-medium text-atraso' : proximoContato?.estado === 'hoje' ? 'font-medium text-hoje' : ''}>
              {proximoContato ? proximoContato.texto : 'Não marcado'}
            </dd>
          </div>
          <div>
            <dt className="text-suave">Cliente desde</dt>
            <dd>{data(cliente.criadoEm)}</dd>
          </div>
        </dl>
        {cliente.observacoes ? <p className="rounded-lg bg-fundo px-3 py-2 text-sm whitespace-pre-line">{cliente.observacoes}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEditar(cliente)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-linha px-3 text-sm font-medium"
          >
            <Pencil size={16} aria-hidden="true" />
            Editar
          </button>
          <button
            type="button"
            onClick={excluir}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-atraso hover:bg-atraso-claro"
          >
            <Trash2 size={16} aria-hidden="true" />
            Excluir
          </button>
        </div>
      </section>

      <form onSubmit={registrar} className="space-y-3 border-y border-linha bg-fundo/60 px-5 py-4" noValidate>
        <h3 className="font-semibold">Registrar contato</h3>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de contato">
          {(Object.keys(NOMES_DE_INTERACAO) as TipoDeInteracao[]).map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={tipo === opcao}
              onClick={() => setTipo(opcao)}
              className={`rounded-full border px-3 py-1.5 text-sm ${tipo === opcao ? 'border-tinta bg-tinta text-fundo' : 'border-linha bg-cartao'}`}
            >
              {NOMES_DE_INTERACAO[opcao]}
            </button>
          ))}
        </div>
        <Campo rotulo="O que aconteceu">
          {(props) => (
            <textarea
              {...props}
              rows={2}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={2000}
              placeholder="Ex.: pediu orçamento da troca de bateria"
            />
          )}
        </Campo>
        {tipo === 'orcamento' || tipo === 'venda' ? (
          <Campo rotulo="Valor" opcional>
            {(props) => <input {...props} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="150,00" />}
          </Campo>
        ) : null}
        <fieldset>
          <legend className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock size={16} aria-hidden="true" />
            Retornar
          </legend>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {ATALHOS.map((atalho) => {
              const dia = somarDias(hoje(), atalho.dias);
              return (
                <button
                  key={atalho.dias}
                  type="button"
                  onClick={() => setProximo(proximo === dia ? '' : dia)}
                  aria-pressed={proximo === dia}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm ${proximo === dia ? 'border-marca bg-marca-claro text-marca' : 'border-linha bg-cartao'}`}
                >
                  {atalho.rotulo}
                </button>
              );
            })}
            <input
              type="date"
              aria-label="Outra data de retorno"
              value={proximo}
              onChange={(e) => setProximo(e.target.value)}
              className="h-9 rounded-lg border border-linha bg-cartao px-2 text-sm"
            />
          </div>
        </fieldset>
        {erroRegistro ? (
          <p className="text-sm text-atraso" role="alert">
            {erroRegistro}
          </p>
        ) : null}
        <BotaoPrincipal ocupado={ocupado}>Registrar</BotaoPrincipal>
      </form>

      <section className="px-5 py-4" aria-labelledby="titulo-historico">
        <h3 id="titulo-historico" className="font-semibold">
          Histórico
        </h3>
        {cliente.interacoes.length === 0 ? (
          <p className="mt-2 text-sm text-suave">Nenhum contato registrado ainda.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-linha pl-4">
            {cliente.interacoes.map((interacao) => (
              <li key={interacao.id} className="relative">
                <span className="absolute top-1.5 -left-[1.4rem] size-2.5 rounded-full bg-marca" aria-hidden="true" />
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-semibold">{NOMES_DE_INTERACAO[interacao.tipo]}</span>
                    {interacao.valor !== null ? <span className="text-marca"> · {reais(interacao.valor)}</span> : null}
                    <span className="text-suave">
                      {' '}
                      · {dataEHora(interacao.criadaEm)} · {interacao.autor}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => apagarRegistro(interacao)}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-suave hover:bg-atraso-claro hover:text-atraso"
                    aria-label="Apagar registro"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-sm whitespace-pre-line">{interacao.texto}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
