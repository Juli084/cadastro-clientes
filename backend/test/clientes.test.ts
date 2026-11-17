import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { criarApp } from '../src/app.js';

// Banco separado do de desenvolvimento. Exige o MongoDB do docker-compose.yml.
process.env.DATABASE_URL ??= 'mongodb://localhost:27017/cadastro_teste?directConnection=true';
process.env.NODE_ENV = 'test';

const ORIGEM = 'http://localhost:5173';
const prisma = new PrismaClient();
let app: FastifyInstance;

const criar = (body: object) => app.inject({ method: 'POST', url: '/customers', payload: body });

describe('API de clientes', () => {
  before(async () => {
    // Aplica o schema (incluindo o índice único de e-mail) no banco de teste.
    const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [cli, 'db', 'push', '--skip-generate'], { stdio: 'ignore', env: process.env });
    app = await criarApp(prisma, ORIGEM);
  });

  beforeEach(async () => {
    await prisma.customer.deleteMany();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('responde ao /health', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(resposta.statusCode, 200);
  });

  it('cadastra com nome aparado e e-mail em minúsculas', async () => {
    const resposta = await criar({ name: '  Maria Silva ', email: 'Maria@Exemplo.COM' });
    assert.equal(resposta.statusCode, 201);
    const corpo = resposta.json();
    assert.match(corpo.id, /^[a-f0-9]{24}$/);
    assert.equal(corpo.name, 'Maria Silva');
    assert.equal(corpo.email, 'maria@exemplo.com');
    assert.equal(corpo.status, true);
  });

  it('ignora campos extras no cadastro, como status', async () => {
    const corpo = (await criar({ name: 'Ana', email: 'ana@exemplo.com', status: false })).json();
    assert.equal(corpo.status, true);
  });

  it('recusa e-mail inválido e nome ausente, dizendo quais campos', async () => {
    const semEmail = await criar({ name: 'João', email: 'nao-e-email' });
    assert.equal(semEmail.statusCode, 400);
    assert.deepEqual(semEmail.json().campos, ['email']);

    const semNome = await criar({ email: 'joao@exemplo.com' });
    assert.equal(semNome.statusCode, 400);
    assert.deepEqual(semNome.json().campos, ['name']);

    const nomeEmBranco = await criar({ name: '    ', email: 'joao@exemplo.com' });
    assert.equal(nomeEmBranco.statusCode, 400);
  });

  it('recusa e-mail repetido, sem diferenciar maiúsculas', async () => {
    await criar({ name: 'Carlos', email: 'carlos@exemplo.com' });
    const repetido = await criar({ name: 'Outro Carlos', email: 'CARLOS@exemplo.com' });
    assert.equal(repetido.statusCode, 409);
  });

  it('lista na ordem de cadastro', async () => {
    await criar({ name: 'Primeiro', email: 'um@exemplo.com' });
    await criar({ name: 'Segundo', email: 'dois@exemplo.com' });
    const lista = (await app.inject({ method: 'GET', url: '/customers' })).json();
    assert.deepEqual(
      lista.map((c: { name: string }) => c.name),
      ['Primeiro', 'Segundo'],
    );
  });

  it('remove pelo id e responde 404 para id que não existe', async () => {
    const { id } = (await criar({ name: 'Remover', email: 'remover@exemplo.com' })).json();

    const removido = await app.inject({ method: 'DELETE', url: `/customers/${id}` });
    assert.equal(removido.statusCode, 204);
    assert.equal((await app.inject({ method: 'GET', url: '/customers' })).json().length, 0);

    const deNovo = await app.inject({ method: 'DELETE', url: `/customers/${id}` });
    assert.equal(deNovo.statusCode, 404);
  });

  it('recusa id malformado sem expor erro do banco', async () => {
    const resposta = await app.inject({ method: 'DELETE', url: '/customers/123' });
    assert.equal(resposta.statusCode, 400);
    assert.doesNotMatch(resposta.body, /prisma|objectid|malformed/i);
  });

  it('libera CORS só para a origem do frontend', async () => {
    const permitida = await app.inject({ method: 'GET', url: '/customers', headers: { origin: ORIGEM } });
    assert.equal(permitida.headers['access-control-allow-origin'], ORIGEM);

    const outra = await app.inject({ method: 'GET', url: '/customers', headers: { origin: 'https://outro-site.example' } });
    assert.notEqual(outra.headers['access-control-allow-origin'], 'https://outro-site.example');
  });
});
