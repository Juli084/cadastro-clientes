/*
 * Normalização e validação dos dados do cliente. Fica separado das rotas para os
 * testes de unidade cobrirem cada regra sem precisar de banco.
 */

export const SITUACOES = ['lead', 'cliente', 'inativo'] as const;
export const ORIGENS = ['instagram', 'whatsapp', 'indicacao', 'google', 'loja', 'site', 'outro'] as const;
export const TIPOS_DE_INTERACAO = ['nota', 'ligacao', 'whatsapp', 'visita', 'orcamento', 'venda'] as const;

export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function digitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

/** Telefone brasileiro com DDD, guardado com o 55. null se não for um telefone válido. */
export function normalizarTelefone(texto: string): string | null {
  let numero = digitos(texto).replace(/^0+/, '');
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  return /^55[1-9][1-9]\d{8,9}$/.test(numero) ? numero : null;
}

function todosIguais(numero: string): boolean {
  return /^(\d)\1+$/.test(numero);
}

export function cpfValido(cpf: string): boolean {
  const numero = digitos(cpf);
  if (numero.length !== 11 || todosIguais(numero)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(numero[i]) * (tamanho + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(numero[tamanho])) return false;
  }
  return true;
}

export function cnpjValido(cnpj: string): boolean {
  const numero = digitos(cnpj);
  if (numero.length !== 14 || todosIguais(numero)) return false;
  for (const tamanho of [12, 13]) {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((total, peso, i) => total + peso * Number(numero[i]), 0);
    const resto = soma % 11;
    if ((resto < 2 ? 0 : 11 - resto) !== Number(numero[tamanho])) return false;
  }
  return true;
}

/** CPF ou CNPJ só com dígitos, com os verificadores conferidos. */
export function normalizarDocumento(texto: string): string | null {
  const numero = digitos(texto);
  if (numero.length === 11) return cpfValido(numero) ? numero : null;
  if (numero.length === 14) return cnpjValido(numero) ? numero : null;
  return null;
}

/** Etiquetas em minúsculas, sem repetição, até 10 por cliente. */
export function normalizarEtiquetas(etiquetas: readonly string[]): string[] {
  const limpas = etiquetas.map((etiqueta) => etiqueta.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
  return [...new Set(limpas)].slice(0, 10);
}

/**
 * O `contains` do Prisma no MongoDB vira expressão regular sem escape: uma busca por ".*"
 * traria todos os clientes, e um padrão malicioso poderia travar o banco (ReDoS).
 */
export function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Texto opcional: espaço em branco vira null, para não guardar campo "vazio". */
export function textoOpcional(texto: string | null | undefined): string | null {
  const limpo = texto?.trim() ?? '';
  return limpo === '' ? null : limpo;
}
