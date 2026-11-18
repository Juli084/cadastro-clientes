import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/*
 * Senha guardada com scrypt, que já vem no Node: sem dependência nativa para compilar.
 * Parâmetros da recomendação da OWASP para scrypt: N = 2^17, r = 8, p = 1.
 * O formato guarda os parâmetros junto do hash, para poder endurecer no futuro sem
 * invalidar as senhas antigas.
 */

const PADRAO = { N: 2 ** 17, r: 8, p: 1 };
const TAMANHO = 64;

function derivar(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    // 128 * N * r bytes de memória; o limite padrão do Node (32 MB) não comporta N = 2^17.
    scrypt(senha.normalize('NFKC'), sal, TAMANHO, { ...opcoes, maxmem: 256 * 1024 * 1024 }, (erro, chave) =>
      erro ? rejeitar(erro) : resolver(chave),
    );
  });
}

export async function gerarHash(senha: string, parametros = PADRAO): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, parametros);
  return ['scrypt', parametros.N, parametros.r, parametros.p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, n, r, p, sal, hash] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !n || !r || !p || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await derivar(senha, Buffer.from(sal, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/**
 * Hash de uma senha qualquer, usado quando o e-mail não existe: o login leva o mesmo
 * tempo com e sem conta, e não dá para descobrir quais e-mails estão cadastrados.
 */
let hashFalso: Promise<string> | undefined;
export function hashParaComparacaoFalsa(): Promise<string> {
  hashFalso ??= gerarHash(randomBytes(16).toString('hex'));
  return hashFalso;
}

export const SENHA_MINIMA = 10;
