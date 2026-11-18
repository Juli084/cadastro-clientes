import { createHash, randomBytes } from 'node:crypto';

export const COOKIE_SESSAO = 'sessao';
export const DURACAO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;

/** Token de 256 bits para o cookie. O banco guarda só o hash: um vazamento do banco não dá acesso. */
export function novoToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
