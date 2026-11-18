import { Download, LogOut, MessageCircle, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type Cliente, type Pagina, type Painel, type Situacao, type Usuario } from '../api.ts';
import { Dialogo, Selo } from '../componentes/comuns.tsx';
import { linkDoWhatsApp, NOMES_DE_SITUACAO, reais, retorno, telefone } from '../formatos.ts';
import { FichaDoCliente } from './FichaDoCliente.tsx';
import { FormularioDoCliente } from './FormularioDoCliente.tsx';

type Retorno = '' | 'hoje' | 'atrasados' | 'semana';

interface Props {
  usuario: Usuario;
  onSair: () => void;
}

function Indicador({
  rotulo,
  valor,
  tom,
  onClick,
  ativo,
  largo = false,
}: {
  rotulo: string;
  valor: string;
  tom?: 'hoje' | 'atraso' | undefined;
  onClick?: () => void;
  ativo?: boolean;
  largo?: boolean;
}) {
  const cor = tom === 'atraso' ? 'text-atraso' : tom === 'hoje' ? 'text-hoje' : 'text-tinta';
  const conteudo = (
    <>
      <span className="block text-sm text-suave">{rotulo}</span>
      <span className={`mt-1 block text-2xl font-bold tabular-nums ${cor}`}>{valor}</span>
    </>
  );
  const classe = `rounded-xl border bg-cartao p-4 text-left ${ativo ? 'border-tinta' : 'border-linha'} ${largo ? 'col-span-2 lg:col-span-1' : ''}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={`${classe} hover:border-suave`}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

export function Carteira({ usuario, onSair }: Props) {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [pagina, setPagina] = useState<Pagina | null>(null);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [situacao, setSituacao] = useState<Situacao | ''>('');
  const [filtroRetorno, setFiltroRetorno] = useState<Retorno>('');
  const [numeroDaPagina, setNumeroDaPagina] = useState(1);
  const [aberto, setAberto] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ cliente: Cliente | null } | null>(null);
  const [versao, setVersao] = useState(0);

  // A busca espera a pessoa parar de digitar.
  useEffect(() => {
    const espera = setTimeout(() => {
      setBuscaAplicada(busca);
      setNumeroDaPagina(1);
    }, 250);
    return () => clearTimeout(espera);
  }, [busca]);

  const atualizar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    let cancelado = false;
    Promise.all([
      api.painel(),
      api.listar({ busca: buscaAplicada, situacao, retorno: filtroRetorno, pagina: numeroDaPagina }),
    ])
      .then(([novoPainel, novaPagina]) => {
        if (cancelado) return;
        setPainel(novoPainel);
        setPagina(novaPagina);
      })
      .catch(() => {
        // 401 leva de volta ao login pelo próprio cliente da API; outros erros mantêm a lista anterior.
      });
    return () => {
      cancelado = true;
    };
  }, [buscaAplicada, situacao, filtroRetorno, numeroDaPagina, versao]);

  function filtrarRetorno(valor: Retorno) {
    setFiltroRetorno(filtroRetorno === valor ? '' : valor);
    setNumeroDaPagina(1);
  }

  const totalDePaginas = pagina ? Math.max(1, Math.ceil(pagina.total / pagina.porPagina)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold">Carteira de clientes</h1>
          <p className="text-sm text-suave">Olá, {usuario.nome}.</p>
        </div>
        <a
          href="/api/clientes.csv"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-linha bg-cartao px-3 text-sm font-medium"
        >
          <Download size={16} aria-hidden="true" />
          Exportar planilha
        </a>
        <button
          type="button"
          onClick={() => setFormulario({ cliente: null })}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-tinta px-4 text-sm font-semibold text-fundo"
        >
          <Plus size={17} aria-hidden="true" />
          Novo cliente
        </button>
        <button type="button" onClick={onSair} className="grid size-10 place-items-center rounded-lg text-suave hover:bg-cartao" aria-label="Sair">
          <LogOut size={18} aria-hidden="true" />
        </button>
      </header>

      {painel ? (
        <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Indicador rotulo="Retornar hoje" valor={String(painel.retornosHoje)} tom="hoje" onClick={() => filtrarRetorno('hoje')} ativo={filtroRetorno === 'hoje'} />
          <Indicador
            rotulo="Retornos atrasados"
            valor={String(painel.retornosAtrasados)}
            tom={painel.retornosAtrasados > 0 ? 'atraso' : undefined}
            onClick={() => filtrarRetorno('atrasados')}
            ativo={filtroRetorno === 'atrasados'}
          />
          <Indicador rotulo="Clientes" valor={String(painel.porSituacao.cliente)} />
          <Indicador rotulo="Leads" valor={String(painel.porSituacao.lead)} />
          <Indicador largo rotulo={`Vendas no mês (${painel.vendasNoMes.quantidade})`} valor={reais(painel.vendasNoMes.valor)} />
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-linha bg-cartao" aria-label="Clientes">
        <div className="flex flex-wrap items-center gap-3 border-b border-linha p-4">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">Buscar por nome, telefone, e-mail ou documento</span>
            <Search size={17} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-suave" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone, e-mail ou CPF"
              className="h-10 w-full rounded-lg border border-linha bg-fundo/50 pr-3 pl-9 focus:border-marca focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">Situação</span>
            <select
              value={situacao}
              onChange={(e) => {
                setSituacao(e.target.value as Situacao | '');
                setNumeroDaPagina(1);
              }}
              className="h-10 rounded-lg border border-linha bg-cartao px-3"
            >
              <option value="">Todas as situações</option>
              {(Object.keys(NOMES_DE_SITUACAO) as Situacao[]).map((valor) => (
                <option key={valor} value={valor}>
                  {NOMES_DE_SITUACAO[valor]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="sr-only">Retorno</span>
            <select
              value={filtroRetorno}
              onChange={(e) => {
                setFiltroRetorno(e.target.value as Retorno);
                setNumeroDaPagina(1);
              }}
              className="h-10 rounded-lg border border-linha bg-cartao px-3"
            >
              <option value="">Qualquer retorno</option>
              <option value="hoje">Retornar hoje</option>
              <option value="atrasados">Atrasados</option>
              <option value="semana">Próximos 7 dias</option>
            </select>
          </label>
        </div>

        {pagina && pagina.itens.length === 0 ? (
          <div className="px-4 py-12 text-center text-suave">
            {pagina.total === 0 && !buscaAplicada && !situacao && !filtroRetorno ? (
              <>
                <p className="font-medium text-tinta">Nenhum cliente cadastrado ainda.</p>
                <p className="mt-1 text-sm">Comece pelo botão "Novo cliente".</p>
              </>
            ) : (
              <p>Nenhum cliente com esses filtros.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-linha">
            {pagina?.itens.map((cliente) => {
              const proximo = cliente.proximoContato ? retorno(cliente.proximoContato) : null;
              return (
                <li key={cliente.id} className="flex items-center gap-3 px-4 py-3 hover:bg-fundo/50">
                  <button type="button" onClick={() => setAberto(cliente.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{cliente.nome}</span>
                      <Selo texto={NOMES_DE_SITUACAO[cliente.situacao]} tom={cliente.situacao === 'cliente' ? 'marca' : 'neutro'} />
                      {cliente.etiquetas.slice(0, 3).map((etiqueta) => (
                        <Selo key={etiqueta} texto={etiqueta} tom="neutro" />
                      ))}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-suave">
                      {[telefone(cliente.telefone), cliente.email, cliente.cidade].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                    </span>
                  </button>
                  {proximo ? (
                    <Selo
                      texto={`Retorno ${proximo.texto}`}
                      tom={proximo.estado === 'atrasado' ? 'atraso' : proximo.estado === 'hoje' ? 'hoje' : 'neutro'}
                    />
                  ) : null}
                  {cliente.telefone ? (
                    <a
                      href={linkDoWhatsApp(cliente.telefone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid size-9 shrink-0 place-items-center rounded-full text-marca hover:bg-marca-claro"
                      aria-label={`Abrir WhatsApp de ${cliente.nome}`}
                    >
                      <MessageCircle size={18} aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {pagina && pagina.total > pagina.porPagina ? (
          <nav className="flex items-center justify-between border-t border-linha px-4 py-3 text-sm" aria-label="Páginas">
            <button
              type="button"
              disabled={numeroDaPagina <= 1}
              onClick={() => setNumeroDaPagina((n) => n - 1)}
              className="rounded-lg border border-linha px-3 py-1.5 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-suave">
              Página {numeroDaPagina} de {totalDePaginas} · {pagina.total} clientes
            </span>
            <button
              type="button"
              disabled={numeroDaPagina >= totalDePaginas}
              onClick={() => setNumeroDaPagina((n) => n + 1)}
              className="rounded-lg border border-linha px-3 py-1.5 disabled:opacity-40"
            >
              Próxima
            </button>
          </nav>
        ) : null}
      </section>

      <Dialogo aberto={aberto !== null && formulario === null} titulo="Ficha do cliente" lateral onFechar={() => setAberto(null)}>
        {aberto ? (
          <FichaDoCliente
            key={`${aberto}-${versao}`}
            id={aberto}
            onEditar={(cliente) => setFormulario({ cliente })}
            onAlterado={atualizar}
            onExcluido={() => {
              setAberto(null);
              atualizar();
            }}
          />
        ) : null}
      </Dialogo>

      <Dialogo
        aberto={formulario !== null}
        titulo={formulario?.cliente ? `Editar ${formulario.cliente.nome}` : 'Novo cliente'}
        onFechar={() => setFormulario(null)}
      >
        {formulario ? (
          <FormularioDoCliente
            cliente={formulario.cliente}
            onSalvo={(cliente) => {
              setFormulario(null);
              setAberto(cliente.id);
              atualizar();
            }}
            onAbrirExistente={(id) => {
              setFormulario(null);
              setAberto(id);
            }}
          />
        ) : null}
      </Dialogo>
    </div>
  );
}
