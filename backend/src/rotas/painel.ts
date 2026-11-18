import type { FastifyPluginAsync } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ORIGENS, SITUACOES } from '../dados.js';
import { hojeEmBrasilia, inicioDoDia, inicioDoMes, somarDias } from '../datas.js';

export const rotasDoPainel: FastifyPluginAsync<{ prisma: PrismaClient }> = async (app, { prisma }) => {
  app.get('/painel', async () => {
    const hoje = hojeEmBrasilia();
    const inicioDeHoje = inicioDoDia(hoje);
    const inicioDeAmanha = inicioDoDia(somarDias(hoje, 1));
    const mes = inicioDoMes();

    const [total, porSituacao, porOrigem, novosNoMes, retornosHoje, retornosAtrasados, vendas] = await Promise.all([
      prisma.cliente.count(),
      prisma.cliente.groupBy({ by: ['situacao'], _count: { _all: true } }),
      prisma.cliente.groupBy({ by: ['origem'], _count: { _all: true } }),
      prisma.cliente.count({ where: { criadoEm: { gte: mes } } }),
      prisma.cliente.count({ where: { proximoContato: { gte: inicioDeHoje, lt: inicioDeAmanha, not: null } } }),
      // null conta como menor que qualquer data no MongoDB; ver a rota de clientes.
      prisma.cliente.count({ where: { proximoContato: { lt: inicioDeHoje, not: null } } }),
      prisma.interacao.aggregate({
        where: { tipo: 'venda', criadaEm: { gte: mes } },
        _sum: { valor: true },
        _count: { _all: true },
      }),
    ]);

    const contar = <T extends string>(chaves: readonly T[], grupos: { chave: string | null; total: number }[]) =>
      Object.fromEntries(chaves.map((chave) => [chave, grupos.find((g) => g.chave === chave)?.total ?? 0])) as Record<
        T,
        number
      >;

    return {
      total,
      porSituacao: contar(SITUACOES, porSituacao.map((g) => ({ chave: g.situacao, total: g._count._all }))),
      porOrigem: {
        ...contar(ORIGENS, porOrigem.map((g) => ({ chave: g.origem, total: g._count._all }))),
        semOrigem: porOrigem.find((g) => g.origem === null)?._count._all ?? 0,
      },
      novosNoMes,
      retornosHoje,
      retornosAtrasados,
      vendasNoMes: { quantidade: vendas._count._all, valor: vendas._sum.valor ?? 0 },
    };
  });
};
