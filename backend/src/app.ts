import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Prisma, type PrismaClient } from '@prisma/client';

const OBJECT_ID = '^[a-f0-9]{24}$';

const cliente = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    email: { type: 'string' },
    status: { type: 'boolean' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
} as const;

const erro = { type: 'object', properties: { erro: { type: 'string' }, campos: { type: 'array', items: { type: 'string' } } } } as const;

export async function criarApp(prisma: PrismaClient, origemPermitida: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: 16 * 1024 });

  await app.register(cors, { origin: origemPermitida, methods: ['GET', 'POST', 'DELETE'] });

  // Erro de validação diz quais campos falharam; qualquer outro vira 500
  // genérico, com o detalhe só no log. Mensagem do banco nunca vai ao cliente.
  app.setErrorHandler<FastifyError>((falha, request, reply) => {
    if (falha.validation) {
      const campos = falha.validation.map((v) => {
        const faltando = (v.params as { missingProperty?: string }).missingProperty;
        return faltando ?? v.instancePath.replace(/^\//, '');
      });
      return reply.code(400).send({ erro: 'Dados inválidos.', campos });
    }
    request.log.error(falha);
    return reply.code(500).send({ erro: 'Erro interno. Tente de novo mais tarde.' });
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/customers', { schema: { response: { 200: { type: 'array', items: cliente } } } }, async () =>
    prisma.customer.findMany({ orderBy: { created_at: 'asc' } }),
  );

  app.post<{ Body: { name: string; email: string } }>(
    '/customers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email'],
          // Campos extras, como "status", são descartados antes de chegar aqui.
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 120 },
            email: { type: 'string', format: 'email', maxLength: 254 },
          },
        },
        response: { 201: cliente, 400: erro, 409: erro },
      },
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      const email = request.body.email.trim().toLowerCase();
      if (name.length < 2) return reply.code(400).send({ erro: 'Dados inválidos.', campos: ['name'] });

      try {
        const novo = await prisma.customer.create({ data: { name, email, status: true } });
        return reply.code(201).send(novo);
      } catch (falha) {
        if (falha instanceof Prisma.PrismaClientKnownRequestError && falha.code === 'P2002') {
          return reply.code(409).send({ erro: 'Já existe um cliente com este e-mail.' });
        }
        throw falha;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/customers/:id',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: OBJECT_ID } } },
        response: { 404: erro },
      },
    },
    async (request, reply) => {
      try {
        await prisma.customer.delete({ where: { id: request.params.id } });
        return reply.code(204).send();
      } catch (falha) {
        if (falha instanceof Prisma.PrismaClientKnownRequestError && falha.code === 'P2025') {
          return reply.code(404).send({ erro: 'Cliente não encontrado.' });
        }
        throw falha;
      }
    },
  );

  return app;
}
