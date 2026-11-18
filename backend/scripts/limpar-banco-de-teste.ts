import { PrismaClient } from '@prisma/client';
import { limparBancoDeTeste } from './banco-de-teste.js';

// Usado pelos testes de ponta a ponta antes de subir a API. Só roda em banco de teste local.
const prisma = new PrismaClient();
try {
  await limparBancoDeTeste(prisma);
} finally {
  await prisma.$disconnect();
}
