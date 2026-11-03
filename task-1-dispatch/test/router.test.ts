// @rev kc-31
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignBranch } from '../src/router.ts';
import { distanceKm } from '../src/geo.ts';
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
  lat: 43.25,
  lon: 76.92,
  pickupPointId: null,
  manualBranchId: null,
  createdAt: '2026-11-16T06:00:00Z',
  ...over,
});

const almaty = branch({ id: 'b-ala', city: 'Алматы', lat: 43.2567, lon: 76.9286 });
const astana = branch({ id: 'b-ast', city: 'Астана', lat: 51.128, lon: 71.43 });

test('distanceKm: Алматы — Астана около 970 км', () => {
  const d = distanceKm(43.2389, 76.8897, 51.1694, 71.4491);
  assert.ok(Math.abs(d - 970) < 15, `получили ${d.toFixed(1)}`);
});

test('manual: заказ уходит в указанный филиал', () => {
  const res = assignBranch(order({ manualBranchId: 'b-ast' }), [almaty, astana]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast', rule: 'manual' });
});

test('manual: неактивный филиал пропускается', () => {
  const closed = { ...astana, active: false };
  const res = assignBranch(order({ manualBranchId: 'b-ast' }), [almaty, closed]);
  assert.notEqual(res.rule, 'manual');
});

test('single: у магазина один активный филиал', () => {
  const res = assignBranch(order({ city: 'Шымкент' }), [almaty]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala', rule: 'single' });
});

test('geo: выбирается ближайший филиал', () => {
  const res = assignBranch(order({ city: 'Конаев', lat: 43.25, lon: 76.93 }), [almaty, astana]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala', rule: 'geo' });
});

test('geo: без координат заказ не распределяется', () => {
  const res = assignBranch(order({ city: 'Конаев', lat: null, lon: null }), [almaty, astana]);
  assert.equal(res.rule, 'unassigned');
});

const ala1 = branch({ id: 'b-ala-1', city: 'Алматы', lat: 43.2402, lon: 76.915, pickupPointIds: ['pp-1'] });
const ala2 = branch({ id: 'b-ala-2', city: 'Алматы', lat: 43.265, lon: 76.835, pickupPointIds: ['pp-2'] });
const ast = branch({ id: 'b-ast-1', city: 'Астана', lat: 51.1282, lon: 71.4304, pickupPointIds: ['pp-3'] });
const all = [ala1, ala2, ast];

test('учитываются только филиалы своего магазина', () => {
  const foreign = branch({ id: 'b-x', storeId: 's-2', lat: 43.25, lon: 76.92 });
  const res = assignBranch(order({}), [foreign, ast]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast-1', rule: 'single' });
});

test('manual: филиал чужого магазина не подходит', () => {
  const foreign = branch({ id: 'b-x', storeId: 's-2' });
  const res = assignBranch(order({ manualBranchId: 'b-x' }), [foreign, ala1, ast]);
  assert.notEqual(res.rule, 'manual');
});

test('pickup_point: пункт выдачи закреплён за филиалом', () => {
  // заказ рядом с b-ala-1, но пункт выдачи закреплён за b-ala-2
  const res = assignBranch(order({ lat: 43.24, lon: 76.915, pickupPointId: 'pp-2' }), all);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala-2', rule: 'pickup_point' });
});

test('pickup_point: пункт неактивного филиала не срабатывает', () => {
  const closed = { ...ala2, active: false };
  const res = assignBranch(order({ city: 'Астана', lat: 51.1, lon: 71.4, pickupPointId: 'pp-2' }), [ala1, closed, ast]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast-1', rule: 'city' });
});

test('city: в городе заказа один филиал магазина', () => {
  // координаты ближе к Алматы, но город — Астана
  const res = assignBranch(order({ city: 'Астана', lat: 43.25, lon: 76.92 }), all);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast-1', rule: 'city' });
});

test('city: срабатывает и без координат', () => {
  const res = assignBranch(order({ city: 'Астана', lat: null, lon: null }), all);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast-1', rule: 'city' });
});

test('geo: если в городе несколько филиалов, выбирается ближайший из них', () => {
  // по прямой ближе всех филиал в другом городе, но в городе заказа есть свои
  const outside = branch({ id: 'b-out', city: 'Каскелен', lat: 43.3, lon: 76.7 });
  const res = assignBranch(order({ lat: 43.3, lon: 76.7 }), [ala1, outside, ala2]);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala-2', rule: 'geo' });
});

test('geo: в городе заказа нет филиалов — ближайший из всех', () => {
  const res = assignBranch(order({ city: 'Каскелен', lat: 43.2, lon: 76.62 }), all);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala-2', rule: 'geo' });
});

test('лимит: заполненный филиал пропускается', () => {
  const load = (id: string) => (id === 'b-ala-2' ? 100 : 0);
  const res = assignBranch(order({ lat: 43.24, lon: 76.915, pickupPointId: 'pp-2' }), all, load);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala-1', rule: 'geo' });
});

test('лимит: запасной филиал ищется среди всех филиалов магазина', () => {
  const load = (id: string) => (id === 'b-ast-1' ? 0 : 100);
  const res = assignBranch(order({}), all, load);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ast-1', rule: 'geo' });
});

test('лимит: single при заполненном филиале — unassigned', () => {
  const res = assignBranch(order({}), [ala1], () => 100);
  assert.deepEqual(res, { orderId: 'o-1', branchId: null, rule: 'unassigned' });
});

test('лимит: city без координат при заполненном филиале — unassigned', () => {
  const load = (id: string) => (id === 'b-ast-1' ? 100 : 0);
  const res = assignBranch(order({ city: 'Астана', lat: null, lon: null }), all, load);
  assert.deepEqual(res, { orderId: 'o-1', branchId: null, rule: 'unassigned' });
});

test('лимит: manual лимит не проверяет', () => {
  const res = assignBranch(order({ manualBranchId: 'b-ala-1' }), all, () => 100);
  assert.deepEqual(res, { orderId: 'o-1', branchId: 'b-ala-1', rule: 'manual' });
});
