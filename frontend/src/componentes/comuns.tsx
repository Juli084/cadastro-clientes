import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

export const ESTILO_CAMPO =
  'mt-1 block w-full rounded-lg border bg-cartao px-3 py-2.5 text-base placeholder:text-suave/60 focus:border-marca focus:outline-none focus:ring-2 focus:ring-marca/20';

/** Janela com o <dialog> nativo: foco, Esc e fundo inerte ficam por conta do navegador. */
export function Dialogo({
  aberto,
  titulo,
  onFechar,
  lateral = false,
  children,
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  lateral?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();
  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={idTitulo}
      className={`janela ${lateral ? 'lateral' : ''}`}
      onCancel={(evento) => {
        evento.preventDefault();
        onFechar();
      }}
      onClick={(evento) => {
        if (evento.target === ref.current) onFechar();
      }}
    >
      {aberto ? (
        <>
          <div className="flex items-center gap-3 border-b border-linha px-5 py-3">
            <h2 id={idTitulo} className="flex-1 truncate text-lg font-semibold">
              {titulo}
            </h2>
            <button
              type="button"
              onClick={onFechar}
              className="grid size-10 place-items-center rounded-full text-suave hover:bg-fundo"
              aria-label="Fechar"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {children}
        </>
      ) : null}
    </dialog>
  );
}

export function Campo({
  rotulo,
  erro,
  dica,
  opcional,
  children,
}: {
  rotulo: string;
  erro?: string | undefined;
  dica?: string;
  opcional?: boolean;
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string; className: string }) => ReactNode;
}) {
  const id = useId();
  const descricao = erro ? `${id}-erro` : dica ? `${id}-dica` : undefined;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo} {opcional ? <span className="font-normal text-suave">(opcional)</span> : null}
      </label>
      {children({
        id,
        ...(erro ? { 'aria-invalid': true as const } : {}),
        ...(descricao ? { 'aria-describedby': descricao } : {}),
        className: `${ESTILO_CAMPO} ${erro ? 'border-atraso' : 'border-linha'}`,
      })}
      {erro ? (
        <p id={`${id}-erro`} className="mt-1 text-sm text-atraso">
          {erro}
        </p>
      ) : dica ? (
        <p id={`${id}-dica`} className="mt-1 text-sm text-suave">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

export function BotaoPrincipal({
  children,
  ocupado = false,
  tipo = 'submit',
  onClick,
}: {
  children: ReactNode;
  ocupado?: boolean;
  tipo?: 'submit' | 'button';
  onClick?: () => void;
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={ocupado}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-tinta px-5 font-semibold text-fundo hover:bg-tinta/90 disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function Selo({ texto, tom }: { texto: string; tom: 'neutro' | 'marca' | 'hoje' | 'atraso' }) {
  const tons = {
    neutro: 'bg-fundo text-suave',
    marca: 'bg-marca-claro text-marca',
    hoje: 'bg-hoje-claro text-hoje',
    atraso: 'bg-atraso-claro text-atraso',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tons[tom]}`}>{texto}</span>;
}
