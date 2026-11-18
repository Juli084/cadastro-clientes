import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import { rotasDeAutenticacao, carregarUsuario } from './rotas/autenticacao.js';
import { rotasDeClientes } from './rotas/clientes.js';
import { rotasDoPainel } from './rotas/painel.js';

export interface Configuracao {
  /** Origem do frontend quando ele roda em outro endereço. null quando tudo é servido no mesmo. */
  origemDoFrontend: string | null;
  /** Cookie só por HTTPS. Desligado apenas em desenvolvimento local. */
  cookieSeguro: boolean;
  /** Tentativas de login por minuto, por IP e e-mail. */
  tentativasDeLogin?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario: { id: string; nome: string; email: string } | null;
  }
}

const METODOS_QUE_ALTERAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function criarApp(prisma: PrismaClient, config: Configuracao): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { redact: ['req.headers.cookie', 'res.headers["set-cookie"]'] },
    bodyLimit: 32 * 1024,
    trustProxy: process.env.ATRAS_DE_PROXY === 'true',
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(cookie);
  // O limite roda depois da leitura do corpo, para contar as tentativas por IP e por e-mail.
  await app.register(rateLimit, { global: false, hook: 'preHandler' });
  if (config.origemDoFrontend) {
    await app.register(cors, {
      origin: config.origemDoFrontend,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    });
  }

  app.decorateRequest('usuario', null);

  /*
   * Proteção contra CSRF em camadas:
   * 1. o cookie de sessão é SameSite=Strict;
   * 2. pedido que altera dados e traz Origin de outro site é recusado;
   * 3. corpo só em JSON, que um formulário de outro site não consegue enviar sem CORS.
   */
  app.addHook('onRequest', async (request, reply) => {
    if (!METODOS_QUE_ALTERAM.has(request.method)) return;
    const origem = request.headers.origin;
    if (origem) {
      const propria = `${request.protocol}://${request.host}`;
      if (origem !== propria && origem !== config.origemDoFrontend) {
        return reply.code(403).send({ erro: 'Origem não permitida.' });
      }
    }
    const tipo = request.headers['content-type'];
    if (tipo && !tipo.startsWith('application/json')) {
      return reply.code(415).send({ erro: 'Envie os dados em JSON.' });
    }
  });

  // Erro de validação diz quais campos falharam; qualquer outro vira 500 genérico, com o
  // detalhe só no log. Mensagem do banco nunca chega ao navegador.
  app.setErrorHandler<FastifyError>((falha, request, reply) => {
    if (falha.validation) {
      const campos = falha.validation.map((v) => {
        const faltando = (v.params as { missingProperty?: string }).missingProperty;
        return faltando ?? v.instancePath.replace(/^\//, '').split('/')[0] ?? '';
      });
      return reply.code(400).send({ erro: 'Dados inválidos.', campos: [...new Set(campos)] });
    }
    if (falha.statusCode === 429) {
      return reply.code(429).send({ erro: 'Muitas tentativas. Espere um minuto e tente de novo.' });
    }
    if (falha.statusCode && falha.statusCode < 500) {
      return reply.code(falha.statusCode).send({ erro: 'Requisição inválida.' });
    }
    request.log.error(falha);
    return reply.code(500).send({ erro: 'Erro interno. Tente de novo mais tarde.' });
  });

  app.get('/api/saude', async () => ({ ok: true }));

  await app.register(rotasDeAutenticacao, { prefix: '/api/auth', prisma, config });

  // Tudo o que mexe com dados de cliente exige sessão.
  await app.register(async (protegido) => {
    protegido.addHook('onRequest', async (request, reply) => {
      request.usuario = await carregarUsuario(prisma, request.cookies);
      if (!request.usuario) return reply.code(401).send({ erro: 'Entre de novo para continuar.' });
    });
    await protegido.register(rotasDeClientes, { prefix: '/api', prisma });
    await protegido.register(rotasDoPainel, { prefix: '/api', prisma });
  });

  return app;
}
