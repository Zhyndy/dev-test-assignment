// @rev kc-31
import { randomUUID } from 'node:crypto';
import type { Booking, Master, Service } from './types.ts';
import type { BookingRepo } from './store.ts';
import { getSlots } from './slots.ts';
import { normalizePhone } from './phone.ts';
import { isValidDate, toLocal } from './time.ts';
import { now as clockNow } from './clock.ts';

export const CANCEL_MIN_BEFORE_MS = 2 * 60 * 60_000;

export type Result<T> = { ok: true; status: number; value: T } | { ok: false; status: number; error: string };

const ok = <T>(value: T, status = 200): Result<T> => ({ ok: true, status, value });
const fail = (status: number, error: string): Result<never> => ({ ok: false, status, error });

const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type Deps = {
  masters: Master[];
  services: Service[];
  repo: BookingRepo;
  now?: () => Date;
};

export function createBookingService({ masters, services, repo, now = clockNow }: Deps) {
  // Проверка слота и вставка идут под замком мастера, иначе два запроса
  // успевают прочитать одинаковое расписание и оба создают запись.
  const locks = new Map<string, Promise<unknown>>();

  function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const run = (locks.get(key) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    locks.set(key, tail);
    void tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });
    return run;
  }

  function resolve(masterId: string, serviceId: string): Result<{ master: Master; service: Service }> {
    const master = masters.find((m) => m.id === masterId);
    if (!master) return fail(404, 'master_not_found');
    const service = services.find((s) => s.id === serviceId);
    if (!service) return fail(404, 'service_not_found');
    if (!service.masterIds.includes(master.id)) return fail(400, 'service_not_offered');
    return ok({ master, service });
  }

  return {
    async slots(masterId: string, serviceId: string | null, date: string | null) {
      if (!serviceId || !date) return fail(400, 'service_id_and_date_required');
      if (!isValidDate(date)) return fail(400, 'invalid_date');
      const found = resolve(masterId, serviceId);
      if (!found.ok) return found;

      const bookings = await repo.listByMaster(masterId);
      const slots = getSlots(found.value.master, found.value.service, date, bookings, now());
      return ok({ masterId, serviceId, date, slots });
    },

    async create(body: unknown): Promise<Result<Booking>> {
      if (typeof body !== 'object' || body === null) return fail(400, 'invalid_body');
      const { masterId, serviceId, start, clientPhone } = body as Record<string, unknown>;
      if (typeof masterId !== 'string' || typeof serviceId !== 'string') return fail(400, 'invalid_body');
      if (typeof start !== 'string' || !ISO_WITH_TZ.test(start) || Number.isNaN(Date.parse(start))) {
        return fail(400, 'invalid_start');
      }
      const phone = typeof clientPhone === 'string' ? normalizePhone(clientPhone) : null;
      if (!phone) return fail(400, 'invalid_phone');

      const found = resolve(masterId, serviceId);
      if (!found.ok) return found;
      const { master, service } = found.value;

      const startMs = Date.parse(start);
      const local = toLocal(startMs);

      return withLock(master.id, async () => {
        const bookings = await repo.listByMaster(master.id);
        const free = getSlots(master, service, local.date, bookings, now());
        if (startMs % 60_000 !== 0 || !free.includes(local.time)) return fail(409, 'slot_unavailable');

        const booking: Booking = {
          id: `bk-${randomUUID()}`,
          masterId: master.id,
          serviceId: service.id,
          start: new Date(startMs).toISOString(),
          end: new Date(startMs + service.durationMin * 60_000).toISOString(),
          clientPhone: phone,
          status: 'active',
        };
        await repo.insert(booking);
        return ok(booking, 201);
      });
    },

    async cancel(id: string): Promise<Result<Booking>> {
      const booking = await repo.get(id);
      if (!booking) return fail(404, 'booking_not_found');
      if (booking.status === 'cancelled') return ok(booking);
      if (Date.parse(booking.start) - now().getTime() < CANCEL_MIN_BEFORE_MS) return fail(409, 'too_late');

      await repo.update(id, { status: 'cancelled' });
      return ok({ ...booking, status: 'cancelled' });
    },
  };
}

export type BookingService = ReturnType<typeof createBookingService>;
