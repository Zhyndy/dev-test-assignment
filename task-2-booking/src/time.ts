// @rev kc-31
import type { Weekday } from './types.ts';

// Казахстан живёт в одном часовом поясе
export const TZ_OFFSET = '+05:00';

const WEEKDAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// date: 'YYYY-MM-DD'
export function weekday(date: string): Weekday {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

// Начало суток по Алматы, мс UTC
export function dayStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00${TZ_OFFSET}`);
}

// Минуты от начала суток date по Алматы; может быть < 0 или > 1440
export function minutesOfDay(date: string, ms: number): number {
  return (ms - dayStartMs(date)) / 60_000;
}

// Момент UTC -> дата 'YYYY-MM-DD' и время 'HH:mm' по Алматы
export function toLocal(ms: number): { date: string; time: string } {
  const iso = new Date(ms + 5 * 60 * 60_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export type Range = { start: number; end: number };

export function overlaps(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}
