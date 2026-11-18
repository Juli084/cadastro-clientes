import { useEffect, useState } from 'react';
import { api, quandoPerderSessao, type Usuario } from './api.ts';
import { Acesso } from './telas/Acesso.tsx';
import { Carteira } from './telas/Carteira.tsx';

type Estado = { carregando: true } | { carregando: false; configurado: boolean; usuario: Usuario | null; erro?: string };

export function App() {
  const [estado, setEstado] = useState<Estado>({ carregando: true });

  useEffect(() => {
    quandoPerderSessao(() => setEstado({ carregando: false, configurado: true, usuario: null }));
    api
      .estado()
      .then(({ configurado, usuario }) => setEstado({ carregando: false, configurado, usuario }))
      .catch(() =>
        setEstado({ carregando: false, configurado: true, usuario: null, erro: 'Não deu para falar com o servidor.' }),
      );
  }, []);

  if (estado.carregando) return null;
  if (estado.erro) {
    return (
      <p className="p-8 text-center text-atraso" role="alert">
        {estado.erro}
      </p>
    );
  }
  if (!estado.usuario) {
    return (
      <Acesso
        configurado={estado.configurado}
        onEntrar={(usuario) => setEstado({ carregando: false, configurado: true, usuario })}
      />
    );
  }
  return (
    <Carteira
      usuario={estado.usuario}
      onSair={async () => {
        await api.sair().catch(() => undefined);
        setEstado({ carregando: false, configurado: true, usuario: null });
      }}
    />
  );
}
