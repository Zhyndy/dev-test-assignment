// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createBookingService } from '../src/booking.ts';
import { createBookingRepo } from '../src/store.ts';
import { createApp } from '../src/app.ts';
import { normalizePhone } from '../src/phone.ts';
import type { Booking, Master, Service } from '../src/types.ts';

const workday = { from: '10:00', to: '19:00', breaks: [{ from: '14:00', to: '15:00' }] };

const masters: Master[] = [
  {
    id: 'm-1',
    name: 'Айгерим',
    schedule: { mon: workday, tue: workday, wed: workday, thu: workday, fri: workday, sat: null, sun: null },
  },
  {
    id: 'm-2',
    name: 'Дана',
    schedule: { mon: workday, tue: workday, wed: workday, thu: workday, fri: workday, sat: null, sun: null },
  },
];

const services: Service[] = [
  { id: 's-cut', name: 'Стрижка', durationMin: 60, masterIds: ['m-1', 'm-2'] },
  { id: 's-mani', name: 'Маникюр', durationMin: 90, masterIds: ['m-2'] },
];

// понедельник, 08:00 по Алматы
const NOW = new Date('2030-11-18T08:00:00+05:00');

const existing: Booking = {
  id: 'bk-1',
  masterId: 'm-1',
  serviceId: 's-cut',
  start: '2030-11-18T05:00:00.000Z', // 10:00 по Алматы
  end: '2030-11-18T06:00:00.000Z',
  clientPhone: '+77012345678',
  status: 'active',
};

const setup = (bookings: Booking[] = [existing]) =>
  createBookingService({ masters, services, repo: createBookingRepo(bookings), now: () => NOW });

const request = (over: Record<string, unknown> = {}) => ({
  masterId: 'm-1',
  serviceId: 's-cut',
  start: '2030-11-18T15:00:00+05:00',
  clientPhone: '8 (701) 234-56-78',
  ...over,
});

test('normalizePhone: допустимые форматы', () => {
  for (const raw of ['+7 701 234 56 78', '87012345678', '8 (701) 234-56-78', '+7(701)2345678', '77012345678']) {
    assert.equal(normalizePhone(raw), '+77012345678', raw);
  }
});

test('normalizePhone: недопустимые номера', () => {
  for (const raw of ['', '7012345678', '+7 901 234 56 78', '8701234567', '870123456789', '+1 701 234 56 78', '8701abc5678']) {
    assert.equal(normalizePhone(raw), null, raw);
  }
});

test('create: запись создаётся, время сохраняется в UTC', async () => {
  const res = await setup().create(request());
  assert.ok(res.ok);
  assert.equal(res.status, 201);
  assert.match(res.value.id, /^bk-/);
  assert.deepEqual({ ...res.value, id: 'x' }, {
    id: 'x',
    masterId: 'm-1',
    serviceId: 's-cut',
    start: '2030-11-18T10:00:00.000Z',
    end: '2030-11-18T11:00:00.000Z',
    clientPhone: '+77012345678',
    status: 'active',
  });
});

test('create: start в другом часовом поясе', async () => {
  const res = await setup().create(request({ start: '2030-11-18T10:00:00Z' }));
  assert.equal(res.status, 201);
});

test('create: созданная запись занимает слот', async () => {
  const service = setup();
  await service.create(request());
  const slots = await service.slots('m-1', 's-cut', '2030-11-18');
  assert.ok(slots.ok);
  assert.ok(!slots.value.slots.includes('15:00'));
  assert.ok(!slots.value.slots.includes('15:45'));
  assert.ok(slots.value.slots.includes('16:00'));
});

test('create: время не из списка свободных слотов — 409', async () => {
  const service = setup();
  const cases = [
    '2030-11-18T10:30:00+05:00', // занято bk-1
    '2030-11-18T13:30:00+05:00', // заходит на перерыв
    '2030-11-18T15:10:00+05:00', // не по сетке 15 минут
    '2030-11-18T15:00:30+05:00', // секунды
    '2030-11-18T18:30:00+05:00', // не помещается до конца дня
    '2030-11-18T07:00:00+05:00', // уже прошло
    '2030-11-23T12:00:00+05:00', // выходной
  ];
  for (const start of cases) {
    const res = await service.create(request({ start }));
    assert.deepEqual(res, { ok: false, status: 409, error: 'slot_unavailable' }, start);
  }
});

test('create: ошибки валидации — 400 и 404', async () => {
  const service = setup();
  const status = async (body: unknown) => (await service.create(body)).status;
  assert.equal(await status(null), 400);
  assert.equal(await status(request({ masterId: 1 })), 400);
  assert.equal(await status(request({ start: '2030-11-18T15:00:00' })), 400);
  assert.equal(await status(request({ start: '18.11.2030 15:00' })), 400);
  assert.equal(await status(request({ clientPhone: '+7 901 234 56 78' })), 400);
  assert.equal(await status(request({ clientPhone: undefined })), 400);
  assert.equal(await status(request({ serviceId: 's-mani' })), 400);
  assert.equal(await status(request({ masterId: 'nope' })), 404);
  assert.equal(await status(request({ serviceId: 'nope' })), 404);
});

test('create: одновременная запись на одно время — создаётся одна', async () => {
  const service = setup([]);
  const results = await Promise.all([service.create(request()), service.create(request())]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});

test('create: одновременная запись на пересекающееся время — создаётся одна', async () => {
  const service = setup([]);
  const results = await Promise.all([
    service.create(request({ start: '2030-11-18T15:00:00+05:00' })),
    service.create(request({ start: '2030-11-18T15:30:00+05:00' })),
    service.create(request({ start: '2030-11-18T15:45:00+05:00' })),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
});

test('create: разные мастера на одно время не мешают друг другу', async () => {
  const service = setup([]);
  const results = await Promise.all([service.create(request()), service.create(request({ masterId: 'm-2' }))]);
  assert.deepEqual(results.map((r) => r.status), [201, 201]);
});

test('cancel: запись отменяется, повторная отмена — 200', async () => {
  const service = setup();
  const first = await service.cancel('bk-1');
  assert.ok(first.ok);
  assert.equal(first.status, 200);
  assert.equal(first.value.status, 'cancelled');

  const second = await service.cancel('bk-1');
  assert.equal(second.status, 200);
  assert.ok(second.ok && second.value.status === 'cancelled');
});

test('cancel: освобождает слот', async () => {
  const service = setup();
  await service.cancel('bk-1');
  const res = await service.create(request({ start: '2030-11-18T10:00:00+05:00' }));
  assert.equal(res.status, 201);
});

test('cancel: меньше чем за 2 часа — too_late', async () => {
  const soon = { ...existing, id: 'bk-soon', start: '2030-11-18T04:59:00.000Z' }; // 09:59, через 1:59
  const exactly = { ...existing, id: 'bk-2h', start: '2030-11-18T05:00:00.000Z' }; // 10:00, ровно через 2 часа
  const service = setup([soon, exactly]);
  assert.deepEqual(await service.cancel('bk-soon'), { ok: false, status: 409, error: 'too_late' });
  assert.equal((await service.cancel('bk-2h')).status, 200);
});

test('cancel: нет такой записи — 404', async () => {
  assert.equal((await setup().cancel('nope')).status, 404);
});

async function withServer(fn: (base: string) => Promise<void>, bookings?: Booking[]) {
  const server = createApp(setup(bookings), masters, services).listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('HTTP: GET /masters/:id/slots', async () => {
  await withServer(async (base) => {
    const ok = await fetch(`${base}/masters/m-1/slots?serviceId=s-cut&date=2030-11-18`);
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.masterId, 'm-1');
    assert.equal(body.slots[0], '11:00');

    const status = async (path: string) => (await fetch(`${base}${path}`)).status;
    assert.equal(await status('/masters/m-1/slots?date=2030-11-18'), 400);
    assert.equal(await status('/masters/m-1/slots?serviceId=s-cut'), 400);
    assert.equal(await status('/masters/m-1/slots?serviceId=s-cut&date=2030-02-30'), 400);
    assert.equal(await status('/masters/m-1/slots?serviceId=s-mani&date=2030-11-18'), 400);
    assert.equal(await status('/masters/nope/slots?serviceId=s-cut&date=2030-11-18'), 404);
    assert.equal(await status('/masters/m-1/slots?serviceId=nope&date=2030-11-18'), 404);
  });
});

test('HTTP: POST /bookings и DELETE /bookings/:id', async () => {
  const soon = { ...existing, id: 'bk-soon', start: '2030-11-18T04:00:00.000Z', end: '2030-11-18T05:00:00.000Z' };
  await withServer(async (base) => {
    const post = (body: string) =>
      fetch(`${base}/bookings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

    const created = await post(JSON.stringify(request()));
    assert.equal(created.status, 201);
    const booking = await created.json();
    assert.equal(booking.clientPhone, '+77012345678');

    const conflict = await post(JSON.stringify(request()));
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: 'slot_unavailable' });

    assert.equal((await post('{not json')).status, 400);
    assert.equal((await post(JSON.stringify(request({ clientPhone: '123' })))).status, 400);

    const cancelled = await fetch(`${base}/bookings/${booking.id}`, { method: 'DELETE' });
    assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).status, 'cancelled');

    const tooLate = await fetch(`${base}/bookings/bk-soon`, { method: 'DELETE' });
    assert.equal(tooLate.status, 409);
    assert.deepEqual(await tooLate.json(), { error: 'too_late' });

    assert.equal((await fetch(`${base}/bookings/nope`, { method: 'DELETE' })).status, 404);
  }, [existing, soon]);
});
