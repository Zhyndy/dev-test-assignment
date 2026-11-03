// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { almatyDate, createDispatch, isValidDate } from '../src/dispatch.ts';
import { createApp } from '../src/app.ts';
import type { Branch, Order } from '../src/types.ts';

const branch = (over: Partial<Branch>): Branch => ({
  id: 'b-1',
  storeId: 's-1',
  name: 'Филиал',
  city: 'Алматы',
  lat: 43.24,
  lon: 76.91,
  active: true,
  pickupPointIds: [],
  dailyLimit: 100,
  ...over,
});

const order = (over: Partial<Order>): Order => ({
  id: 'o-1',
  storeId: 's-1',
  city: 'Алматы',
  lat: 43.24,
  lon: 76.91,
  pickupPointId: null,
  manualBranchId: null,
  createdAt: '2026-11-16T06:00:00Z',
  ...over,
});

const near = branch({ id: 'b-near', lat: 43.24, lon: 76.91, dailyLimit: 1 });
const far = branch({ id: 'b-far', lat: 43.3, lon: 76.8 });

test('almatyDate: сутки по UTC+5', () => {
  assert.equal(almatyDate('2026-11-15T18:59:59Z'), '2026-11-15');
  assert.equal(almatyDate('2026-11-15T19:00:00Z'), '2026-11-16');
});

test('isValidDate', () => {
  assert.equal(isValidDate('2026-11-16'), true);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('16.11.2026'), false);
  assert.equal(isValidDate('2026-11-16T00:00'), false);
});

test('assign: неизвестный заказ — null', () => {
  assert.equal(createDispatch([near], []).assign('nope'), null);
});

test('assign: повторный вызов возвращает то же и не занимает лимит', () => {
  const dispatch = createDispatch([near, far], [order({ id: 'o-1' })]);
  const first = dispatch.assign('o-1');
  const second = dispatch.assign('o-1');
  assert.deepEqual(second, first);
  assert.deepEqual(first, { orderId: 'o-1', branchId: 'b-near', rule: 'geo' });
  assert.equal(dispatch.load('b-near', '2026-11-16')?.assigned, 1);
});

test('assign: после заполнения лимита заказ уходит в ближайший свободный', () => {
  const dispatch = createDispatch([near, far], [order({ id: 'o-1' }), order({ id: 'o-2' })]);
  dispatch.assign('o-1');
  assert.deepEqual(dispatch.assign('o-2'), { orderId: 'o-2', branchId: 'b-far', rule: 'geo' });
});

test('assign: лимит считается по суткам Алматы', () => {
  const orders = [
    order({ id: 'o-1', createdAt: '2026-11-15T18:30:00Z' }), // 15-е, 23:30 по Алматы
    order({ id: 'o-2', createdAt: '2026-11-15T19:30:00Z' }), // 16-е, 00:30 по Алматы
  ];
  const dispatch = createDispatch([near, far], orders);
  assert.equal(dispatch.assign('o-1')?.branchId, 'b-near');
  assert.equal(dispatch.assign('o-2')?.branchId, 'b-near');
  assert.deepEqual(dispatch.load('b-near', '2026-11-15'), { branchId: 'b-near', date: '2026-11-15', assigned: 1, limit: 1 });
  assert.deepEqual(dispatch.load('b-near', '2026-11-16'), { branchId: 'b-near', date: '2026-11-16', assigned: 1, limit: 1 });
});

test('assign: manual занимает место в загрузке филиала', () => {
  const dispatch = createDispatch([near, far], [order({ id: 'o-1', manualBranchId: 'b-near' }), order({ id: 'o-2' })]);
  dispatch.assign('o-1');
  assert.equal(dispatch.assign('o-2')?.branchId, 'b-far');
});

test('load: неизвестный филиал — null', () => {
  assert.equal(createDispatch([near], []).load('nope', '2026-11-16'), null);
});

async function withServer(fn: (base: string) => Promise<void>) {
  const branches = [near, far];
  const orders = [order({ id: 'o-1' })];
  const server = createApp(createDispatch(branches, orders), branches, orders).listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test('HTTP: POST /orders/:id/assign', async () => {
  await withServer(async (base) => {
    const ok = await fetch(`${base}/orders/o-1/assign`, { method: 'POST' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { orderId: 'o-1', branchId: 'b-near', rule: 'geo' });

    const again = await fetch(`${base}/orders/o-1/assign`, { method: 'POST' });
    assert.deepEqual(await again.json(), { orderId: 'o-1', branchId: 'b-near', rule: 'geo' });

    const missing = await fetch(`${base}/orders/nope/assign`, { method: 'POST' });
    assert.equal(missing.status, 404);
  });
});

test('HTTP: GET /branches/:id/load', async () => {
  await withServer(async (base) => {
    await fetch(`${base}/orders/o-1/assign`, { method: 'POST' });

    const ok = await fetch(`${base}/branches/b-near/load?date=2026-11-16`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { branchId: 'b-near', date: '2026-11-16', assigned: 1, limit: 1 });

    assert.equal((await fetch(`${base}/branches/b-near/load`)).status, 400);
    assert.equal((await fetch(`${base}/branches/b-near/load?date=2026-02-30`)).status, 400);
    assert.equal((await fetch(`${base}/branches/nope/load?date=2026-11-16`)).status, 404);
  });
});
