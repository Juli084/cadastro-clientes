import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { criarApp } from '../src/app.js';
import { hojeEmBrasilia, somarDias } from '../src/datas.js';
import { hashDoToken } from '../src/seguranca/sessao.js';
import { exigirBancoDeTeste, limparBancoDeTeste } from '../scripts/banco-de-teste.js';

// Banco separado do de desenvolvimento. Exige o MongoDB do docker-compose.yml.
process.env.DATABASE_URL ??= 'mongodb://localhost:27017/cadastro_teste?directConnection=true';
process.env.NODE_ENV = 'test';

const prisma = new PrismaClient();
let app: FastifyInstance;
let cookie = '';

const DONO = { nome: 'Júlio', email: 'dono@exemplo.com', senha: 'uma senha bem longa' };
const hoje = hojeEmBrasilia();

async function pedir(method: InjectOptions['method'], url: string, payload?: object, extras: InjectOptions = {}) {
  return app.inject({ method, url, payload, headers: cookie ? { cookie } : {}, ...extras });
}

function cookieDaResposta(cabecalho: string | string[] | undefined): string {
  const linha = Array.isArray(cabecalho) ? cabecalho[0] : cabecalho;
  return linha?.split(';')[0] ?? '';
}

describe('API da carteira de clientes', () => {
  before(async () => {
    exigirBancoDeTeste();
    const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [cli, 'db', 'push', '--skip-generate'], { stdio: 'ignore', env: process.env });
    await limparBancoDeTeste(prisma);
    app = await criarApp(prisma, { origemDoFrontend: null, cookieSeguro: true, tentativasDeLogin: 3 });
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('primeiro acesso e login', () => {
    it('começa sem conta e sem acesso aos clientes', async () => {
      assert.deepEqual((await pedir('GET', '/api/auth/estado')).json(), { configurado: false, usuario: null });
      assert.equal((await pedir('GET', '/api/clientes')).statusCode, 401);
    });

    it('cria o dono com cookie HttpOnly, Secure e SameSite=Strict', async () => {
      const resposta = await pedir('POST', '/api/auth/configurar', DONO);
      assert.equal(resposta.statusCode, 201);
      const cabecalho = String(resposta.headers['set-cookie']);
      assert.match(cabecalho, /HttpOnly/);
      assert.match(cabecalho, /Secure/);
      assert.match(cabecalho, /SameSite=Strict/);
      cookie = cookieDaResposta(resposta.headers['set-cookie']);
      const usuario = await prisma.usuario.findUniqueOrThrow({ where: { email: DONO.email } });
      assert.match(usuario.senhaHash, /^scrypt\$131072\$8\$1\$/);
      assert.ok(!usuario.senhaHash.includes(DONO.senha));
    });

    it('guarda só o hash do token da sessão', async () => {
      const token = cookie.split('=')[1] ?? '';
      assert.equal(await prisma.sessao.count({ where: { tokenHash: token } }), 0);
      assert.equal(await prisma.sessao.count({ where: { tokenHash: hashDoToken(token) } }), 1);
    });

    it('não deixa configurar de novo', async () => {
      const resposta = await pedir('POST', '/api/auth/configurar', { ...DONO, email: 'outro@exemplo.com' });
      assert.equal(resposta.statusCode, 409);
    });

    it('dá a mesma resposta para e-mail inexistente e senha errada', async () => {
      const semConta = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { email: 'ninguem@exemplo.com', senha: 'x' } });
      const errada = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { email: DONO.email, senha: 'errada' } });
      assert.equal(semConta.statusCode, 401);
      assert.equal(errada.statusCode, 401);
      assert.deepEqual(semConta.json(), errada.json());
    });

    it('entra com a senha certa', async () => {
      const resposta = await app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { email: ' DONO@exemplo.com ', senha: DONO.senha } });
      assert.equal(resposta.statusCode, 200);
      assert.equal(resposta.json().nome, DONO.nome);
    });

    it('limita as tentativas de login por e-mail', async () => {
      const tentar = () => app.inject({ method: 'POST', url: '/api/auth/entrar', payload: { email: 'alvo@exemplo.com', senha: 'chute' } });
      for (let i = 0; i < 3; i++) assert.equal((await tentar()).statusCode, 401);
      const bloqueada = await tentar();
      assert.equal(bloqueada.statusCode, 429);
      assert.match(bloqueada.json().erro, /Muitas tentativas/);
    });
  });

  describe('proteção contra CSRF', () => {
    it('recusa pedido que altera dados vindo de outro site', async () => {
      const resposta = await pedir('POST', '/api/clientes', { nome: 'Teste' }, { headers: { cookie, origin: 'https://site-malicioso.example' } });
      assert.equal(resposta.statusCode, 403);
      assert.equal(await prisma.cliente.count(), 0);
    });

    it('recusa corpo que não seja JSON, como o de um formulário', async () => {
      const resposta = await app.inject({
        method: 'POST',
        url: '/api/clientes',
        headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'nome=Teste',
      });
      assert.equal(resposta.statusCode, 415);
    });
  });

  describe('clientes', () => {
    let joao = '';
    let maria = '';

    it('cadastra normalizando telefone, documento, e-mail e etiquetas', async () => {
      const resposta = await pedir('POST', '/api/clientes', {
        nome: '  João   da Silva ',
        email: 'JOAO@Exemplo.com',
        telefone: '(15) 99999-0000',
        documento: '529.982.247-25',
        etiquetas: ['VIP', ' vip ', 'Revenda'],
        origem: 'instagram',
        proximoContato: hoje,
        senhaHash: 'campo que não existe no formulário',
      });
      assert.equal(resposta.statusCode, 201);
      const cliente = resposta.json();
      joao = cliente.id;
      assert.equal(cliente.nome, 'João da Silva');
      assert.equal(cliente.email, 'joao@exemplo.com');
      assert.equal(cliente.telefone, '5515999990000');
      assert.equal(cliente.documento, '52998224725');
      assert.deepEqual(cliente.etiquetas, ['vip', 'revenda']);
      assert.equal(cliente.situacao, 'lead');
      assert.equal(cliente.proximoContato, hoje);
      assert.equal(cliente.nomeBusca, undefined);
    });

    it('aponta os campos inválidos', async () => {
      const resposta = await pedir('POST', '/api/clientes', { nome: 'Ana', telefone: '123', documento: '529.982.247-26' });
      assert.equal(resposta.statusCode, 400);
      assert.deepEqual(resposta.json().campos.sort(), ['documento', 'telefone']);
    });

    it('avisa quando o telefone já é de outro cliente', async () => {
      const resposta = await pedir('POST', '/api/clientes', { nome: 'Outro João', telefone: '15 99999 0000' });
      assert.equal(resposta.statusCode, 409);
      assert.deepEqual(resposta.json().existente, { id: joao, nome: 'João da Silva' });
    });

    it('busca sem acento, por telefone e por etiqueta', async () => {
      maria = (await pedir('POST', '/api/clientes', { nome: 'Maria Conceição', situacao: 'cliente', proximoContato: somarDias(hoje, -2) })).json().id;
      const nomes = async (consulta: string) =>
        ((await pedir('GET', `/api/clientes?${consulta}`)).json().itens as { nome: string }[]).map((c) => c.nome);
      assert.deepEqual(await nomes('busca=joao'), ['João da Silva']);
      assert.deepEqual(await nomes('busca=CONCEICAO'), ['Maria Conceição']);
      assert.deepEqual(await nomes('busca=99999'), ['João da Silva']);
      assert.deepEqual(await nomes('etiqueta=VIP'), ['João da Silva']);
      assert.deepEqual(await nomes('situacao=cliente'), ['Maria Conceição']);
      assert.deepEqual(await nomes('retorno=hoje'), ['João da Silva']);
      assert.deepEqual(await nomes('retorno=atrasados'), ['Maria Conceição']);
    });

    it('trata a busca como texto, não como expressão regular', async () => {
      for (const termo of ['.*', '(a+)+$', '[']) {
        const resposta = await pedir('GET', `/api/clientes?busca=${encodeURIComponent(termo)}`);
        assert.equal(resposta.statusCode, 200, termo);
        assert.equal(resposta.json().total, 0, termo);
      }
    });

    it('edita só os campos enviados e limpa o retorno com null', async () => {
      const resposta = await pedir('PATCH', `/api/clientes/${maria}`, { cidade: 'Sorocaba', proximoContato: null });
      assert.equal(resposta.statusCode, 200);
      assert.equal(resposta.json().cidade, 'Sorocaba');
      assert.equal(resposta.json().proximoContato, null);
      assert.equal(resposta.json().situacao, 'cliente');
      // Regressão: sem data de retorno, o cliente não pode aparecer como atrasado.
      assert.equal((await pedir('GET', '/api/clientes?retorno=atrasados')).json().total, 0);
    });

    it('responde 404 para id inexistente e 400 para id malformado', async () => {
      assert.equal((await pedir('GET', '/api/clientes/aaaaaaaaaaaaaaaaaaaaaaaa')).statusCode, 404);
      assert.equal((await pedir('GET', '/api/clientes/abc')).statusCode, 400);
    });

    it('registra uma venda: guarda o autor, marca o contato e transforma o lead em cliente', async () => {
      const amanha = somarDias(hoje, 1);
      const resposta = await pedir('POST', `/api/clientes/${joao}/interacoes`, {
        tipo: 'venda',
        texto: 'Troca de tela do iPhone',
        valor: 45000,
        proximoContato: amanha,
      });
      assert.equal(resposta.statusCode, 201);
      assert.equal(resposta.json().autor, 'Júlio');
      const detalhe = (await pedir('GET', `/api/clientes/${joao}`)).json();
      assert.equal(detalhe.situacao, 'cliente');
      assert.equal(detalhe.proximoContato, amanha);
      assert.ok(detalhe.ultimoContato);
      assert.equal(detalhe.interacoes.length, 1);
    });

    it('resume a carteira no painel', async () => {
      const painel = (await pedir('GET', '/api/painel')).json();
      assert.equal(painel.total, 2);
      assert.deepEqual(painel.porSituacao, { lead: 0, cliente: 2, inativo: 0 });
      assert.equal(painel.retornosHoje, 0);
      assert.equal(painel.retornosAtrasados, 0);
      assert.deepEqual(painel.vendasNoMes, { quantidade: 1, valor: 45000 });
      assert.equal(painel.porOrigem.instagram, 1);
      assert.equal(painel.porOrigem.semOrigem, 1);
    });

    it('exporta CSV para Excel, sem deixar texto virar fórmula', async () => {
      await pedir('POST', '/api/clientes', { nome: '=HYPERLINK("http://x")' });
      const resposta = await pedir('GET', '/api/clientes.csv');
      assert.equal(resposta.statusCode, 200);
      assert.match(String(resposta.headers['content-type']), /^text\/csv/);
      assert.match(String(resposta.headers['content-disposition']), /attachment; filename="clientes-\d{4}-\d{2}-\d{2}\.csv"/);
      assert.ok(resposta.body.startsWith('﻿Nome;Telefone;E-mail'));
      assert.match(resposta.body, /"'=HYPERLINK\(""http:\/\/x""\)"/);
      assert.match(resposta.body, /'\+5515999990000/);
    });

    it('exclui o cliente junto com o histórico', async () => {
      assert.equal((await pedir('DELETE', `/api/clientes/${joao}`)).statusCode, 204);
      assert.equal(await prisma.interacao.count({ where: { clienteId: joao } }), 0);
      assert.equal((await pedir('GET', `/api/clientes/${joao}`)).statusCode, 404);
    });
  });

  describe('fim da sessão', () => {
    it('sessão vencida não vale', async () => {
      await prisma.sessao.updateMany({ data: { expiraEm: new Date(Date.now() - 1000) } });
      assert.equal((await pedir('GET', '/api/clientes')).statusCode, 401);
      await prisma.sessao.updateMany({ data: { expiraEm: new Date(Date.now() + 60_000) } });
    });

    it('sair apaga a sessão no banco e o cookie', async () => {
      const resposta = await pedir('POST', '/api/auth/sair');
      assert.equal(resposta.statusCode, 204);
      assert.match(String(resposta.headers['set-cookie']), /sessao=;/);
      assert.equal((await pedir('GET', '/api/clientes')).statusCode, 401);
    });
  });
});
