import type { FastifyPluginAsync } from 'fastify';
import type { Cliente, Interacao, Prisma, PrismaClient } from '@prisma/client';
import { montarCsv } from '../csv.js';
import {
  digitos,
  escaparRegex,
  normalizarDocumento,
  normalizarEtiquetas,
  normalizarTelefone,
  ORIGENS,
  semAcento,
  SITUACOES,
  textoOpcional,
  TIPOS_DE_INTERACAO,
} from '../dados.js';
import { diaDe, diaValido, hojeEmBrasilia, inicioDoDia, somarDias } from '../datas.js';

interface Opcoes {
  prisma: PrismaClient;
}

const OBJECT_ID = '^[a-f0-9]{24}$';
const POR_PAGINA = 25;

interface EntradaCliente {
  nome?: string;
  email?: string | null;
  telefone?: string | null;
  documento?: string | null;
  cidade?: string | null;
  origem?: string | null;
  etiquetas?: string[];
  situacao?: string;
  aceitaMensagens?: boolean;
  observacoes?: string | null;
  proximoContato?: string | null;
}

const textoOuNulo = (maximo: number) => ({ type: ['string', 'null'], maxLength: maximo }) as const;

const corpoDoCliente = {
  type: 'object',
  additionalProperties: false,
  properties: {
    nome: { type: 'string', minLength: 2, maxLength: 120 },
    email: textoOuNulo(254),
    telefone: textoOuNulo(30),
    documento: textoOuNulo(20),
    cidade: textoOuNulo(80),
    origem: { anyOf: [{ type: 'string', enum: [...ORIGENS] }, { type: 'null' }] },
    etiquetas: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 24 } },
    situacao: { type: 'string', enum: [...SITUACOES] },
    aceitaMensagens: { type: 'boolean' },
    observacoes: textoOuNulo(2000),
    proximoContato: textoOuNulo(10),
  },
} as const;

const clienteNaResposta = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    nome: { type: 'string' },
    email: { type: ['string', 'null'] },
    telefone: { type: ['string', 'null'] },
    documento: { type: ['string', 'null'] },
    cidade: { type: ['string', 'null'] },
    origem: { type: ['string', 'null'] },
    etiquetas: { type: 'array', items: { type: 'string' } },
    situacao: { type: 'string' },
    aceitaMensagens: { type: 'boolean' },
    observacoes: { type: ['string', 'null'] },
    proximoContato: { type: ['string', 'null'] },
    ultimoContato: { type: ['string', 'null'] },
    criadoEm: { type: 'string' },
    atualizadoEm: { type: 'string' },
  },
} as const;

const interacaoNaResposta = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    tipo: { type: 'string' },
    texto: { type: 'string' },
    valor: { type: ['integer', 'null'] },
    autor: { type: 'string' },
    criadaEm: { type: 'string' },
  },
} as const;

function paraResposta(cliente: Cliente) {
  return {
    ...cliente,
    proximoContato: diaDe(cliente.proximoContato),
    ultimoContato: cliente.ultimoContato?.toISOString() ?? null,
    criadoEm: cliente.criadoEm.toISOString(),
    atualizadoEm: cliente.atualizadoEm.toISOString(),
  };
}

function interacaoParaResposta(interacao: Interacao) {
  return { ...interacao, criadaEm: interacao.criadaEm.toISOString() };
}

/**
 * Normaliza o que veio do formulário e aponta os campos inválidos. No PATCH (parcial),
 * só os campos enviados entram no resultado.
 */
export function prepararCliente(entrada: EntradaCliente, parcial: boolean) {
  const dados: Prisma.ClienteUpdateInput & Partial<Prisma.ClienteCreateInput> = {};
  const campos: string[] = [];
  const enviado = (campo: keyof EntradaCliente) => !parcial || entrada[campo] !== undefined;

  if (enviado('nome')) {
    const nome = (entrada.nome ?? '').trim().replace(/\s+/g, ' ');
    if (nome.length < 2) campos.push('nome');
    dados.nome = nome;
    dados.nomeBusca = semAcento(nome);
  }
  if (enviado('email')) {
    const email = textoOpcional(entrada.email)?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) campos.push('email');
    dados.email = email;
  }
  if (enviado('telefone')) {
    const bruto = textoOpcional(entrada.telefone);
    const telefone = bruto ? normalizarTelefone(bruto) : null;
    if (bruto && !telefone) campos.push('telefone');
    dados.telefone = telefone;
  }
  if (enviado('documento')) {
    const bruto = textoOpcional(entrada.documento);
    const documento = bruto ? normalizarDocumento(bruto) : null;
    if (bruto && !documento) campos.push('documento');
    dados.documento = documento;
  }
  if (enviado('cidade')) dados.cidade = textoOpcional(entrada.cidade);
  if (enviado('origem')) dados.origem = entrada.origem ?? null;
  if (enviado('etiquetas')) dados.etiquetas = normalizarEtiquetas(entrada.etiquetas ?? []);
  if (enviado('situacao')) dados.situacao = entrada.situacao ?? 'lead';
  if (enviado('aceitaMensagens')) dados.aceitaMensagens = entrada.aceitaMensagens ?? false;
  if (enviado('observacoes')) dados.observacoes = textoOpcional(entrada.observacoes);
  if (enviado('proximoContato')) {
    const dia = textoOpcional(entrada.proximoContato);
    if (dia && !diaValido(dia)) campos.push('proximoContato');
    dados.proximoContato = dia && diaValido(dia) ? inicioDoDia(dia) : null;
  }
  return { dados, campos };
}

export const rotasDeClientes: FastifyPluginAsync<Opcoes> = async (app, { prisma }) => {
  /** Outro cliente com o mesmo e-mail ou telefone, para não cadastrar a mesma pessoa duas vezes. */
  async function duplicado(dados: { email?: unknown; telefone?: unknown }, ignorarId?: string) {
    const condicoes: Prisma.ClienteWhereInput[] = [];
    if (typeof dados.email === 'string') condicoes.push({ email: dados.email });
    if (typeof dados.telefone === 'string') condicoes.push({ telefone: dados.telefone });
    if (condicoes.length === 0) return null;
    const existente = await prisma.cliente.findFirst({
      where: { OR: condicoes, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
      select: { id: true, nome: true, email: true, telefone: true },
    });
    if (!existente) return null;
    const campo = typeof dados.email === 'string' && existente.email === dados.email ? 'email' : 'telefone';
    return {
      erro: `Já existe um cliente com este ${campo === 'email' ? 'e-mail' : 'telefone'}: ${existente.nome}.`,
      campos: [campo],
      existente: { id: existente.id, nome: existente.nome },
    };
  }

  app.get<{
    Querystring: { busca?: string; situacao?: string; etiqueta?: string; retorno?: string; pagina?: number };
  }>(
    '/clientes',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            busca: { type: 'string', maxLength: 100 },
            situacao: { type: 'string', enum: [...SITUACOES] },
            etiqueta: { type: 'string', maxLength: 24 },
            retorno: { type: 'string', enum: ['hoje', 'atrasados', 'semana'] },
            pagina: { type: 'integer', minimum: 1, maximum: 10000, default: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              itens: { type: 'array', items: clienteNaResposta },
              total: { type: 'integer' },
              pagina: { type: 'integer' },
              porPagina: { type: 'integer' },
            },
          },
        },
      },
    },
    async (request) => {
      const { busca, situacao, etiqueta, retorno, pagina = 1 } = request.query;
      const filtros: Prisma.ClienteWhereInput[] = [];
      const termo = busca?.trim() ?? '';
      if (termo) {
        const alternativas: Prisma.ClienteWhereInput[] = [
          { nomeBusca: { contains: escaparRegex(semAcento(termo)) } },
          { email: { contains: escaparRegex(termo.toLowerCase()) } },
        ];
        const numeros = digitos(termo);
        if (numeros.length >= 3) {
          alternativas.push({ telefone: { contains: numeros } }, { documento: { contains: numeros } });
        }
        filtros.push({ OR: alternativas });
      }
      if (situacao) filtros.push({ situacao });
      if (etiqueta) filtros.push({ etiquetas: { has: etiqueta.trim().toLowerCase() } });
      if (retorno) {
        const hoje = hojeEmBrasilia();
        // "not: null" é necessário: na tradução do Prisma para o MongoDB, null conta como
        // menor que qualquer data, e quem não tem retorno marcado apareceria como atrasado.
        const intervalos = {
          hoje: { gte: inicioDoDia(hoje), lt: inicioDoDia(somarDias(hoje, 1)), not: null },
          atrasados: { lt: inicioDoDia(hoje), not: null },
          semana: { gte: inicioDoDia(hoje), lt: inicioDoDia(somarDias(hoje, 7)), not: null },
        };
        filtros.push({ proximoContato: intervalos[retorno as keyof typeof intervalos] });
      }
      const where: Prisma.ClienteWhereInput = filtros.length ? { AND: filtros } : {};
      const [itens, total] = await Promise.all([
        prisma.cliente.findMany({
          where,
          orderBy: retorno ? [{ proximoContato: 'asc' }, { nome: 'asc' }] : [{ atualizadoEm: 'desc' }],
          skip: (pagina - 1) * POR_PAGINA,
          take: POR_PAGINA,
        }),
        prisma.cliente.count({ where }),
      ]);
      return { itens: itens.map(paraResposta), total, pagina, porPagina: POR_PAGINA };
    },
  );

  app.post<{ Body: EntradaCliente }>(
    '/clientes',
    { schema: { body: { ...corpoDoCliente, required: ['nome'] }, response: { 201: clienteNaResposta } } },
    async (request, reply) => {
      const { dados, campos } = prepararCliente(request.body, false);
      if (campos.length) return reply.code(400).send({ erro: 'Confira os campos destacados.', campos });
      const repetido = await duplicado(dados);
      if (repetido) return reply.code(409).send(repetido);
      const criado = await prisma.cliente.create({ data: dados as Prisma.ClienteCreateInput });
      return reply.code(201).send(paraResposta(criado));
    },
  );

  app.get('/clientes.csv', async (_request, reply) => {
    const clientes = await prisma.cliente.findMany({ orderBy: { nome: 'asc' } });
    const csv = montarCsv(
      [
        'Nome',
        'Telefone',
        'E-mail',
        'CPF/CNPJ',
        'Cidade',
        'Origem',
        'Situação',
        'Etiquetas',
        'Aceita mensagens',
        'Próximo contato',
        'Último contato',
        'Cadastrado em',
        'Observações',
      ],
      clientes.map((cliente) => [
        cliente.nome,
        cliente.telefone ? `+${cliente.telefone}` : '',
        cliente.email,
        cliente.documento,
        cliente.cidade,
        cliente.origem,
        cliente.situacao,
        cliente.etiquetas.join(', '),
        cliente.aceitaMensagens ? 'sim' : 'não',
        diaDe(cliente.proximoContato),
        diaDe(cliente.ultimoContato),
        diaDe(cliente.criadoEm),
        cliente.observacoes,
      ]),
    );
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="clientes-${hojeEmBrasilia()}.csv"`)
      .header('cache-control', 'no-store')
      .send(csv);
  });

  const parametrosComId = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', pattern: OBJECT_ID } },
  } as const;

  app.get<{ Params: { id: string } }>(
    '/clientes/:id',
    {
      schema: {
        params: parametrosComId,
        response: {
          200: {
            type: 'object',
            properties: { ...clienteNaResposta.properties, interacoes: { type: 'array', items: interacaoNaResposta } },
          },
        },
      },
    },
    async (request, reply) => {
      const cliente = await prisma.cliente.findUnique({
        where: { id: request.params.id },
        include: { interacoes: { orderBy: { criadaEm: 'desc' }, take: 200 } },
      });
      if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado.' });
      return { ...paraResposta(cliente), interacoes: cliente.interacoes.map(interacaoParaResposta) };
    },
  );

  app.patch<{ Params: { id: string }; Body: EntradaCliente }>(
    '/clientes/:id',
    { schema: { params: parametrosComId, body: corpoDoCliente, response: { 200: clienteNaResposta } } },
    async (request, reply) => {
      const { dados, campos } = prepararCliente(request.body, true);
      if (campos.length) return reply.code(400).send({ erro: 'Confira os campos destacados.', campos });
      const existe = await prisma.cliente.findUnique({ where: { id: request.params.id }, select: { id: true } });
      if (!existe) return reply.code(404).send({ erro: 'Cliente não encontrado.' });
      const repetido = await duplicado(dados, request.params.id);
      if (repetido) return reply.code(409).send(repetido);
      const atualizado = await prisma.cliente.update({ where: { id: request.params.id }, data: dados });
      return paraResposta(atualizado);
    },
  );

  // Exclusão definitiva, com o histórico junto: atende ao pedido de eliminação da LGPD.
  app.delete<{ Params: { id: string } }>('/clientes/:id', { schema: { params: parametrosComId } }, async (request, reply) => {
    const existe = await prisma.cliente.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!existe) return reply.code(404).send({ erro: 'Cliente não encontrado.' });
    await prisma.interacao.deleteMany({ where: { clienteId: request.params.id } });
    await prisma.cliente.delete({ where: { id: request.params.id } });
    return reply.code(204).send();
  });

  app.post<{
    Params: { id: string };
    Body: { tipo: string; texto: string; valor?: number | null; proximoContato?: string | null };
  }>(
    '/clientes/:id/interacoes',
    {
      schema: {
        params: parametrosComId,
        body: {
          type: 'object',
          required: ['tipo', 'texto'],
          additionalProperties: false,
          properties: {
            tipo: { type: 'string', enum: [...TIPOS_DE_INTERACAO] },
            texto: { type: 'string', minLength: 1, maxLength: 2000 },
            valor: { type: ['integer', 'null'], minimum: 0, maximum: 100_000_000_00 },
            proximoContato: textoOuNulo(10),
          },
        },
        response: { 201: interacaoNaResposta },
      },
    },
    async (request, reply) => {
      const { tipo, texto, valor, proximoContato } = request.body;
      if (texto.trim() === '') return reply.code(400).send({ erro: 'Escreva o que aconteceu.', campos: ['texto'] });
      if (proximoContato && !diaValido(proximoContato)) {
        return reply.code(400).send({ erro: 'Data de retorno inválida.', campos: ['proximoContato'] });
      }
      const cliente = await prisma.cliente.findUnique({ where: { id: request.params.id } });
      if (!cliente) return reply.code(404).send({ erro: 'Cliente não encontrado.' });

      const atualizar: Prisma.ClienteUpdateInput = { ultimoContato: new Date() };
      if (proximoContato !== undefined) atualizar.proximoContato = proximoContato ? inicioDoDia(proximoContato) : null;
      // Registrar uma venda para um lead já o transforma em cliente.
      if (tipo === 'venda' && cliente.situacao === 'lead') atualizar.situacao = 'cliente';

      const [interacao] = await prisma.$transaction([
        prisma.interacao.create({
          data: {
            clienteId: cliente.id,
            tipo,
            texto: texto.trim(),
            valor: valor ?? null,
            autor: request.usuario?.nome ?? '',
          },
        }),
        prisma.cliente.update({ where: { id: cliente.id }, data: atualizar }),
      ]);
      return reply.code(201).send(interacaoParaResposta(interacao));
    },
  );

  app.delete<{ Params: { id: string; interacao: string } }>(
    '/clientes/:id/interacoes/:interacao',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id', 'interacao'],
          properties: { id: { type: 'string', pattern: OBJECT_ID }, interacao: { type: 'string', pattern: OBJECT_ID } },
        },
      },
    },
    async (request, reply) => {
      const { count } = await prisma.interacao.deleteMany({
        where: { id: request.params.interacao, clienteId: request.params.id },
      });
      if (count === 0) return reply.code(404).send({ erro: 'Registro não encontrado.' });
      return reply.code(204).send();
    },
  );
};
