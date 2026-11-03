// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlots } from '../src/slots.ts';
import { overlaps, toMinutes } from '../src/time.ts';
import type { Booking, Master, Service } from '../src/types.ts';

const day = { from: '10:00', to: '13:00', breaks: [] };

const master: Master = {
  id: 'm-1',
  name: 'Тест',
  schedule: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: null, sun: null },
};

const cut: Service = { id: 's-cut', name: 'Стрижка', durationMin: 60, masterIds: ['m-1'] };

const range = (from: string, to: string) => ({ start: toMinutes(from), end: toMinutes(to) });

const longAgo = new Date('2020-01-01T00:00:00Z');

// время по Алматы 2030-11-18 (понедельник)
const booking = (from: string, to: string, over: Partial<Booking> = {}): Booking => ({
  id: 'bk',
  masterId: 'm-1',
  serviceId: 's-cut',
  start: new Date(`2030-11-18T${from}:00+05:00`).toISOString(),
  end: new Date(`2030-11-18T${to}:00+05:00`).toISOString(),
  clientPhone: '+77012345678',
  status: 'active',
  ...over,
});

test('overlaps: пересекающиеся интервалы', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('10:30', '11:30')), true);
});

test('overlaps: запись сразу после другой не пересекается', () => {
  assert.equal(overlaps(range('10:00', '11:00'), range('11:00', '12:00')), false);
});

test('overlaps: вложенный интервал пересекается', () => {
  assert.equal(overlaps(range('10:00', '12:00'), range('10:30', '11:00')), true);
});

test('getSlots: свободный день', () => {
  // 2030-11-18 — понедельник
  const slots = getSlots(master, cut, '2030-11-18', [], longAgo);
  assert.deepEqual(slots, ['10:00', '10:15', '10:30', '10:45', '11:00', '11:15', '11:30', '11:45', '12:00']);
});

test('getSlots: выходной', () => {
  assert.deepEqual(getSlots(master, cut, '2030-11-23', [], longAgo), []);
});

test('getSlots: слот не пересекает перерыв', () => {
  const withBreak = { from: '10:00', to: '13:00', breaks: [{ from: '11:00', to: '12:00' }] };
  const m = { ...master, schedule: { ...master.schedule, mon: withBreak } };
  assert.deepEqual(getSlots(m, cut, '2030-11-18', [], longAgo), ['10:00', '12:00']);
});

test('getSlots: занятое время не выдаётся, отменённые записи не мешают', () => {
  const bookings = [
    booking('10:30', '11:30'),
    booking('12:00', '13:00', { status: 'cancelled' }),
    booking('10:00', '13:00', { masterId: 'm-2' }),
  ];
  assert.deepEqual(getSlots(master, cut, '2030-11-18', bookings, longAgo), ['11:30', '11:45', '12:00']);
});

test('getSlots: запись вплотную к занятому времени допустима', () => {
  const slots = getSlots(master, cut, '2030-11-18', [booking('11:00', '12:00')], longAgo);
  assert.deepEqual(slots, ['10:00', '12:00']);
});

test('getSlots: прошедшее время не выдаётся', () => {
  const now = new Date('2030-11-18T11:00:00+05:00');
  assert.deepEqual(getSlots(master, cut, '2030-11-18', [], now), ['11:15', '11:30', '11:45', '12:00']);
});

test('getSlots: прошедший день пуст', () => {
  const now = new Date('2030-11-19T09:00:00+05:00');
  assert.deepEqual(getSlots(master, cut, '2030-11-18', [], now), []);
});
