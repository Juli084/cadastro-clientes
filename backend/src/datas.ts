/*
 * Datas de retorno são dias, não instantes: "ligar dia 20". Guardo cada uma como a
 * meia-noite daquele dia no horário de Brasília, que não tem horário de verão desde 2019.
 */

const FUSO = '-03:00';

export function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00${FUSO}`);
}

/** Dia de hoje em Brasília, no formato AAAA-MM-DD. */
export function hojeEmBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

export function somarDias(dia: string, dias: number): string {
  const data = inicioDoDia(dia);
  data.setUTCDate(data.getUTCDate() + dias);
  return hojeEmBrasilia(data);
}

export function inicioDoMes(agora = new Date()): Date {
  return inicioDoDia(`${hojeEmBrasilia(agora).slice(0, 7)}-01`);
}

export function diaValido(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const data = inicioDoDia(dia);
  return !Number.isNaN(data.getTime()) && hojeEmBrasilia(data) === dia;
}

/** Converte a data guardada de volta para AAAA-MM-DD. */
export function diaDe(data: Date | null): string | null {
  return data ? hojeEmBrasilia(data) : null;
}
