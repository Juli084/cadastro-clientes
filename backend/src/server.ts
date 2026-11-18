import { PrismaClient } from '@prisma/client';
import { criarApp } from './app.js';

try {
  process.loadEnvFile();
} catch {
  // Sem .env: usa as variáveis do ambiente.
}

const prisma = new PrismaClient();
const app = await criarApp(prisma, {
  origemDoFrontend: process.env.ORIGEM_DO_FRONTEND || null,
  // Em produção o cookie só trafega por HTTPS. Só desligue em desenvolvimento local.
  cookieSeguro: process.env.COOKIE_SEGURO !== 'false',
});

async function encerrar(codigo: number) {
  await app.close();
  await prisma.$disconnect();
  process.exit(codigo);
}

process.on('SIGINT', () => void encerrar(0));
process.on('SIGTERM', () => void encerrar(0));

try {
  await app.listen({ port: Number(process.env.PORT ?? 3333), host: process.env.HOST ?? '127.0.0.1' });
} catch (falha) {
  app.log.error(falha);
  await encerrar(1);
}
