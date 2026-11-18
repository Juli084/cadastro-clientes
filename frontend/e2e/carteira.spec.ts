import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const DONO = { nome: 'Júlio', email: 'dono@exemplo.com', senha: 'uma senha bem longa' };

test('do primeiro acesso ao histórico do cliente', async ({ page }) => {
  const erros: string[] = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  page.on('console', (mensagem) => {
    // O teste provoca de propósito 400 (CPF inválido), 401 (senha errada) e 409 (telefone
    // repetido); o navegador registra essas respostas no console. Qualquer outro erro conta.
    const esperado = /status of (400|401|409)/.test(mensagem.text());
    if (mensagem.type() === 'error' && !esperado) erros.push(mensagem.text());
  });

  await test.step('cria a conta no primeiro acesso', async () => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Criar a conta' })).toBeVisible();
    await page.getByLabel('Seu nome').fill(DONO.nome);
    await page.getByLabel('E-mail').fill(DONO.email);
    await page.getByLabel('Senha').fill('curta');
    await page.getByRole('button', { name: 'Criar e entrar' }).click();
    await expect(page.getByRole('alert')).toContainText('pelo menos 10 caracteres');
    await page.getByLabel('Senha').fill(DONO.senha);
    await page.getByRole('button', { name: 'Criar e entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Carteira de clientes' })).toBeVisible();
    await expect(page.getByText('Nenhum cliente cadastrado ainda.')).toBeVisible();
  });

  await test.step('cadastra um cliente com retorno para hoje', async () => {
    await page.getByRole('button', { name: 'Novo cliente' }).click();
    const janela = page.getByRole('dialog', { name: 'Novo cliente' });
    await janela.getByLabel('Nome').fill('João da Silva');
    await janela.getByLabel(/WhatsApp ou telefone/).fill('(15) 99999-0000');
    await janela.getByLabel(/CPF ou CNPJ/).fill('529.982.247-24');
    await janela.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(janela.getByText('CPF ou CNPJ inválido: confira os números.')).toBeVisible();
    await janela.getByLabel(/CPF ou CNPJ/).fill('529.982.247-25');
    await janela.getByLabel(/Etiquetas/).fill('VIP, iphone');
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    await janela.getByLabel(/Próximo contato/).fill(hoje);
    await janela.getByRole('button', { name: 'Cadastrar' }).click();

    const ficha = page.getByRole('dialog', { name: 'Ficha do cliente' });
    await expect(ficha.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', 'https://wa.me/5515999990000');
    await expect(ficha.getByText('529.982.247-25')).toBeVisible();
    await expect(ficha.getByText('hoje', { exact: true })).toBeVisible();
  });

  await test.step('registra uma venda e agenda o retorno', async () => {
    const ficha = page.getByRole('dialog', { name: 'Ficha do cliente' });
    await ficha.getByRole('radio', { name: 'Venda' }).click();
    await ficha.getByLabel('O que aconteceu').fill('Troca de tela do iPhone 13');
    await ficha.getByLabel(/Valor/).fill('450,00');
    await ficha.getByRole('button', { name: 'Amanhã' }).click();
    await ficha.getByRole('button', { name: 'Registrar' }).click();
    await expect(ficha.getByText('Troca de tela do iPhone 13')).toBeVisible();
    await expect(ficha.getByText('· R$ 450,00')).toBeVisible();
    await expect(ficha.getByText('Cliente', { exact: true })).toBeVisible();
    await expect(ficha.getByText('amanhã', { exact: true })).toBeVisible();
    await ficha.getByRole('button', { name: 'Fechar' }).click();
    const resumo = page.getByRole('region', { name: 'Resumo' });
    await expect(resumo).toContainText('Vendas no mês (1)');
    await expect(resumo).toContainText('R$ 450,00');
  });

  await test.step('não cadastra o mesmo telefone duas vezes', async () => {
    await page.getByRole('button', { name: 'Novo cliente' }).click();
    const janela = page.getByRole('dialog', { name: 'Novo cliente' });
    await janela.getByLabel('Nome').fill('João Silva');
    await janela.getByLabel(/WhatsApp ou telefone/).fill('15 99999 0000');
    await janela.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(janela.getByRole('alert')).toContainText('Já existe um cliente com este telefone: João da Silva.');
    await janela.getByRole('button', { name: 'Abrir cadastro' }).click();
    await expect(page.getByRole('dialog', { name: 'Ficha do cliente' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Ficha do cliente' }).getByRole('button', { name: 'Fechar' }).click();
  });

  await test.step('busca sem acento e exporta a planilha', async () => {
    await page.getByRole('searchbox').fill('joao');
    await expect(page.getByRole('button', { name: /João da Silva/ })).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Exportar planilha' }).click()]);
    const csv = await readFile(await download.path(), 'utf-8');
    expect(csv.startsWith('﻿Nome;Telefone;E-mail')).toBe(true);
    expect(csv).toContain("João da Silva;'+5515999990000;");
  });

  await test.step('sai, recusa senha errada e entra de novo', async () => {
    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await page.getByLabel('E-mail').fill(DONO.email);
    await page.getByLabel('Senha').fill('senha errada demais');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
    await page.getByLabel('Senha').fill(DONO.senha);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Carteira de clientes' })).toBeVisible();
  });

  await test.step('exclui o cliente com confirmação', async () => {
    await page.getByRole('button', { name: /João da Silva/ }).click();
    page.once('dialog', (confirmacao) => void confirmacao.accept());
    await page.getByRole('dialog', { name: 'Ficha do cliente' }).getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByText('Nenhum cliente cadastrado ainda.')).toBeVisible();
  });

  expect(erros).toEqual([]);
});
