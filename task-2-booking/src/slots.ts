// @rev kc-31
import type { Booking, Master, Service } from './types.ts';
import { fromMinutes, minutesOfDay, overlaps, toMinutes, weekday, type Range } from './time.ts';

export const SLOT_STEP_MIN = 15;

// Свободные слоты мастера на дату, 'HH:mm' по Алматы
export function getSlots(master: Master, service: Service, date: string, bookings: Booking[], now: Date): string[] {
  const day = master.schedule[weekday(date)];
  if (!day) return [];

  const busy: Range[] = [
    ...day.breaks.map((b) => ({ start: toMinutes(b.from), end: toMinutes(b.to) })),
    ...bookings
      .filter((b) => b.masterId === master.id && b.status === 'active')
      .map((b) => ({ start: minutesOfDay(date, Date.parse(b.start)), end: minutesOfDay(date, Date.parse(b.end)) })),
  ];
  const nowMin = minutesOfDay(date, now.getTime());

  const result: string[] = [];
  const end = toMinutes(day.to);
  for (let t = toMinutes(day.from); t + service.durationMin <= end; t += SLOT_STEP_MIN) {
    const slot = { start: t, end: t + service.durationMin };
    if (t <= nowMin) continue;
    if (busy.some((r) => overlaps(slot, r))) continue;
    result.push(fromMinutes(t));
  }
  return result;
}
