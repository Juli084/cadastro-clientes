/*
 * Exportação em CSV no formato que o Excel em português abre direto: separador ";",
 * UTF-8 com BOM e quebra de linha CRLF.
 */

/**
 * Célula que começa com =, +, -, @, tabulação ou retorno seria interpretada como fórmula
 * pelo Excel e pelo LibreOffice (injeção de CSV). Um apóstrofo na frente faz a planilha
 * mostrar o texto como texto.
 */
export function celula(valor: string | number | boolean | null | undefined): string {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[";\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function montarCsv(cabecalho: readonly string[], linhas: readonly (readonly unknown[])[]): string {
  const todas = [cabecalho, ...linhas].map((linha) =>
    linha.map((valor) => celula(valor as string | number | boolean | null | undefined)).join(';'),
  );
  return `﻿${todas.join('\r\n')}\r\n`;
}
