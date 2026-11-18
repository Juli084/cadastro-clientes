import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Configuracao } from '../app.js';
import { conferirSenha, gerarHash, hashParaComparacaoFalsa, SENHA_MINIMA } from '../seguranca/senha.js';
import { COOKIE_SESSAO, DURACAO_SESSAO_MS, hashDoToken, novoToken } from '../seguranca/sessao.js';

interface Opcoes {
  prisma: PrismaClient;
  config: Configuracao;
}

const usuarioPublico = {
  type: 'object',
  properties: { id: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string' } },
} as const;

export async function carregarUsuario(
  prisma: PrismaClient,
  cookies: Record<string, string | undefined>,
): Promise<{ id: string; nome: string; email: string } | null> {
  const token = cookies[COOKIE_SESSAO];
  if (!token || token.length > 100) return null;
  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: hashDoToken(token) },
    include: { usuario: { select: { id: true, nome: true, email: true } } },
  });
  if (!sessao || sessao.expiraEm.getTime() <= Date.now()) return null;
  return sessao.usuario;
}

export const rotasDeAutenticacao: FastifyPluginAsync<Opcoes> = async (app, { prisma, config }) => {
  async function abrirSessao(reply: FastifyReply, usuarioId: string) {
    const token = novoToken();
    await prisma.sessao.create({
      data: { tokenHash: hashDoToken(token), usuarioId, expiraEm: new Date(Date.now() + DURACAO_SESSAO_MS) },
    });
    reply.setCookie(COOKIE_SESSAO, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSeguro,
      path: '/',
      maxAge: DURACAO_SESSAO_MS / 1000,
    });
  }

  const limite = {
    rateLimit: {
      max: config.tentativasDeLogin ?? 5,
      timeWindow: '1 minute',
      keyGenerator: (request: { ip: string; body?: unknown }) => {
        const email = (request.body as { email?: unknown } | undefined)?.email;
        return `${request.ip}|${typeof email === 'string' ? email.trim().toLowerCase() : ''}`;
      },
    },
  };

  app.get(
    '/estado',
    { schema: { response: { 200: { type: 'object', properties: { configurado: { type: 'boolean' }, usuario: { anyOf: [usuarioPublico, { type: 'null' }] } } } } } },
    async (request) => ({
      configurado: (await prisma.usuario.count()) > 0,
      usuario: await carregarUsuario(prisma, request.cookies),
    }),
  );

  // Primeiro acesso: cria o dono da conta. Depois que existe um usuário, a rota fecha.
  app.post<{ Body: { nome: string; email: string; senha: string } }>(
    '/configurar',
    {
      config: limite,
      schema: {
        body: {
          type: 'object',
          required: ['nome', 'email', 'senha'],
          additionalProperties: false,
          properties: {
            nome: { type: 'string', minLength: 2, maxLength: 80 },
            email: { type: 'string', format: 'email', maxLength: 254 },
            senha: { type: 'string', minLength: SENHA_MINIMA, maxLength: 200 },
          },
        },
        response: { 201: usuarioPublico },
      },
    },
    async (request, reply) => {
      if ((await prisma.usuario.count()) > 0) return reply.code(409).send({ erro: 'A conta já foi configurada.' });
      const { nome, email, senha } = request.body;
      const usuario = await prisma.usuario.create({
        data: { nome: nome.trim(), email: email.trim().toLowerCase(), senhaHash: await gerarHash(senha) },
        select: { id: true, nome: true, email: true },
      });
      await abrirSessao(reply, usuario.id);
      return reply.code(201).send(usuario);
    },
  );

  app.post<{ Body: { email: string; senha: string } }>(
    '/entrar',
    {
      config: limite,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'senha'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 254 },
            senha: { type: 'string', maxLength: 200 },
          },
        },
        response: { 200: usuarioPublico },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim().toLowerCase();
      const usuario = await prisma.usuario.findUnique({ where: { email } });
      // Com e-mail inexistente, compara com um hash falso: mesmo tempo de resposta e
      // a mesma mensagem, para não revelar quem tem conta.
      const certa = await conferirSenha(request.body.senha, usuario?.senhaHash ?? (await hashParaComparacaoFalsa()));
      if (!usuario || !certa) return reply.code(401).send({ erro: 'E-mail ou senha incorretos.' });
      await prisma.sessao.deleteMany({ where: { usuarioId: usuario.id, expiraEm: { lt: new Date() } } });
      await abrirSessao(reply, usuario.id);
      return { id: usuario.id, nome: usuario.nome, email: usuario.email };
    },
  );

  app.post('/sair', async (request, reply) => {
    const token = request.cookies[COOKIE_SESSAO];
    if (token) await prisma.sessao.deleteMany({ where: { tokenHash: hashDoToken(token) } });
    reply.clearCookie(COOKIE_SESSAO, { path: '/' });
    return reply.code(204).send();
  });
};
