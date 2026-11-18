import type { PrismaClient } from '@prisma/client';

/**
 * Trava antes de apagar dados: só aceita MongoDB local e banco com nome terminando em
 * "_teste" ou "_e2e". Um DATABASE_URL de produção esquecido no ambiente faz o teste parar
 * aqui, em vez de apagar a carteira de clientes.
 */
export function exigirBancoDeTeste(url = process.env.DATABASE_URL ?? ''): void {
  let endereco: URL;
  try {
    endereco = new URL(url);
  } catch {
    throw new Error('DATABASE_URL inválida para teste.');
  }
  const local = ['localhost', '127.0.0.1'].includes(endereco.hostname);
  const nome = endereco.pathname.replace(/^\//, '');
  if (!local || !/_(teste|e2e)$/.test(nome)) {
    throw new Error(`Recusado: "${endereco.hostname}/${nome}" não é um banco de teste local (nome terminado em _teste ou _e2e).`);
  }
}

export async function limparBancoDeTeste(prisma: PrismaClient): Promise<void> {
  exigirBancoDeTeste();
  await prisma.interacao.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.sessao.deleteMany();
  await prisma.usuario.deleteMany();
}
