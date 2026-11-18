import type { Origem, Situacao, TipoDeInteracao } from './api.ts';

export const NOMES_DE_SITUACAO: Record<Situacao, string> = { lead: 'Lead', cliente: 'Cliente', inativo: 'Inativo' };

export const NOMES_DE_ORIGEM: Record<Origem, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  indicacao: 'Indicação',
  google: 'Google',
  loja: 'Na loja',
  site: 'Site',
  outro: 'Outro',
};

export const NOMES_DE_INTERACAO: Record<TipoDeInteracao, string> = {
  nota: 'Anotação',
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  visita: 'Visita',
  orcamento: 'Orçamento',
  venda: 'Venda',
};

/** 5515999990000 → (15) 99999-0000 */
export function telefone(numero: string | null): string {
  if (!numero) return '';
  const local = numero.startsWith('55') ? numero.slice(2) : numero;
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  const meio = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}

export function documento(numero: string | null): string {
  if (!numero) return '';
  if (numero.length === 11) return numero.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return numero.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function reais(centavos: number): string {
  return formatoReal.format(centavos / 100).replace(/00a0/g, ' ');
}

/** "120,50" ou "1.200" em centavos; null se não for valor. */
export function lerValor(texto: string): number | null {
  let limpo = texto.replace(/[R$\s]/g, '');
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(limpo)) limpo = limpo.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

export function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function somarDias(dia: string, dias: number): string {
  const data = new Date(`${dia}T12:00:00-03:00`);
  data.setUTCDate(data.getUTCDate() + dias);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(data);
}

/** Data de retorno relativa a hoje: "hoje", "amanhã", "há 3 dias", "sex., 21/11". */
export function retorno(dia: string): { texto: string; estado: 'atrasado' | 'hoje' | 'futuro' } {
  const agora = hoje();
  if (dia === agora) return { texto: 'hoje', estado: 'hoje' };
  const diferenca = Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${agora}T12:00:00Z`)) / 86_400_000);
  if (diferenca < 0) return { texto: diferenca === -1 ? 'ontem' : `há ${-diferenca} dias`, estado: 'atrasado' };
  if (diferenca === 1) return { texto: 'amanhã', estado: 'futuro' };
  const data = new Date(`${dia}T12:00:00Z`);
  return {
    texto: new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(data),
    estado: 'futuro',
  };
}

export function dataEHora(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(iso));
}

export function data(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(
    new Date(iso),
  );
}

export function linkDoWhatsApp(numero: string): string {
  return `https://wa.me/${numero}`;
}
