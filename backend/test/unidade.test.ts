import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { celula, montarCsv } from '../src/csv.js';
import { cnpjValido, cpfValido, escaparRegex, normalizarDocumento, normalizarEtiquetas, normalizarTelefone, semAcento } from '../src/dados.js';
import { diaDe, diaValido, hojeEmBrasilia, inicioDoDia, inicioDoMes, somarDias } from '../src/datas.js';
import { prepararCliente } from '../src/rotas/clientes.js';
import { exigirBancoDeTeste } from '../scripts/banco-de-teste.js';
import { conferirSenha, gerarHash } from '../src/seguranca/senha.js';

describe('dados do cliente', () => {
  it('normaliza telefone com e sem 55 e recusa DDD inválido', () => {
    assert.equal(normalizarTelefone('(15) 99999-0000'), '5515999990000');
    assert.equal(normalizarTelefone('+55 (15) 3333-0000'), '551533330000');
    assert.equal(normalizarTelefone('(10) 99999-0000'), null);
    assert.equal(normalizarTelefone('9999-0000'), null);
  });

  it('confere os dígitos de CPF e CNPJ', () => {
    assert.equal(cpfValido('529.982.247-25'), true);
    assert.equal(cpfValido('529.982.247-26'), false);
    assert.equal(cnpjValido('11.222.333/0001-81'), true);
    assert.equal(cnpjValido('11.222.333/0001-80'), false);
    assert.equal(normalizarDocumento('529.982.247-25'), '52998224725');
    assert.equal(normalizarDocumento('123'), null);
  });

  it('padroniza etiquetas', () => {
    assert.deepEqual(normalizarEtiquetas([' VIP ', 'vip', 'Revenda  Sul', '', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']), [
      'vip',
      'revenda sul',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
    ]);
  });

  it('escapa a busca antes de virar expressão regular', () => {
    assert.equal(escaparRegex(String.raw`a.b*(c)+[d]\e`), String.raw`a\.b\*\(c\)\+\[d\]\\e`);
    assert.equal(new RegExp(escaparRegex('(a+)+$')).test('(a+)+$'), true);
  });

  it('tira acentos para a busca', () => {
    assert.equal(semAcento('  JOÃO Conceição '), 'joao conceicao');
  });

  it('aponta todos os campos inválidos de uma vez', () => {
    const { campos } = prepararCliente(
      { nome: 'A', email: 'sem-arroba', telefone: '123', documento: '111.111.111-11', proximoContato: '2026-02-30' },
      false,
    );
    assert.deepEqual(campos.sort(), ['documento', 'email', 'nome', 'proximoContato', 'telefone']);
  });

  it('no PATCH, só mexe no que foi enviado', () => {
    const { dados, campos } = prepararCliente({ cidade: '  Sorocaba ' }, true);
    assert.deepEqual(campos, []);
    assert.deepEqual(dados, { cidade: 'Sorocaba' });
  });
});

describe('CSV', () => {
  it('neutraliza células que virariam fórmula na planilha', () => {
    assert.equal(celula('=HYPERLINK("http://x","clique")'), `"'=HYPERLINK(""http://x"",""clique"")"`);
    assert.equal(celula('+5515999990000'), "'+5515999990000");
    assert.equal(celula('-2'), "'-2");
    assert.equal(celula('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(celula('Maria'), 'Maria');
  });

  it('usa ; como separador, aspas quando preciso, BOM e CRLF', () => {
    const csv = montarCsv(['Nome', 'Obs'], [['Ana; Souza', 'linha 1\nlinha 2'], ['Bia', null]]);
    assert.equal(csv, '﻿Nome;Obs\r\n"Ana; Souza";"linha 1\nlinha 2"\r\nBia;\r\n');
  });
});

describe('datas no horário de Brasília', () => {
  it('usa o dia de Brasília, não o UTC', () => {
    // 01:30 UTC do dia 18 ainda é dia 17 em Brasília.
    assert.equal(hojeEmBrasilia(new Date('2026-11-18T01:30:00Z')), '2026-11-17');
    assert.equal(inicioDoDia('2026-11-17').toISOString(), '2026-11-17T03:00:00.000Z');
    assert.equal(diaDe(inicioDoDia('2026-11-17')), '2026-11-17');
  });

  it('soma dias atravessando o mês e acha o início do mês', () => {
    assert.equal(somarDias('2026-11-30', 1), '2026-12-01');
    assert.equal(inicioDoMes(new Date('2026-11-18T12:00:00Z')).toISOString(), '2026-11-01T03:00:00.000Z');
  });

  it('recusa data que não existe', () => {
    assert.equal(diaValido('2026-02-29'), false);
    assert.equal(diaValido('2028-02-29'), true);
    assert.equal(diaValido('20/11/2026'), false);
  });
});

describe('trava do banco de teste', () => {
  it('só aceita MongoDB local com nome de banco de teste', () => {
    assert.doesNotThrow(() => exigirBancoDeTeste('mongodb://localhost:27017/cadastro_teste?directConnection=true'));
    assert.doesNotThrow(() => exigirBancoDeTeste('mongodb://127.0.0.1:27017/cadastro_e2e'));
    assert.throws(() => exigirBancoDeTeste('mongodb://localhost:27017/cadastro'), /Recusado/);
    assert.throws(() => exigirBancoDeTeste('mongodb+srv://usuario:senha@cluster.exemplo.net/cadastro_teste'), /Recusado/);
  });
});

describe('senha', () => {
  it('confere a senha certa e recusa a errada, com sal diferente a cada hash', async () => {
    const parametros = { N: 2 ** 12, r: 8, p: 1 };
    const hash = await gerarHash('cavalo correto bateria', parametros);
    assert.match(hash, /^scrypt\$4096\$8\$1\$/);
    assert.equal(await conferirSenha('cavalo correto bateria', hash), true);
    assert.equal(await conferirSenha('cavalo correto bateriA', hash), false);
    assert.notEqual(await gerarHash('cavalo correto bateria', parametros), hash);
    assert.equal(await conferirSenha('qualquer', 'formato-invalido'), false);
  });
});
