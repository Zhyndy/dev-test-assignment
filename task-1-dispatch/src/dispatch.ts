// @rev kc-31
import type { Assignment, Branch, Order } from './types.ts';
import { assignBranch } from './router.ts';

const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;

// 'YYYY-MM-DD' по Алматы для момента в UTC
export function almatyDate(iso: string): string {
  return new Date(Date.parse(iso) + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export function createDispatch(branches: Branch[], orders: Order[]) {
  // orderId -> распределение
  const assignments = new Map<string, Assignment>();
  // `${branchId}|${date}` -> сколько заказов закреплено
  const loads = new Map<string, number>();

  const loadKey = (branchId: string, date: string) => `${branchId}|${date}`;
  const load = (branchId: string, date: string) => loads.get(loadKey(branchId, date)) ?? 0;

  return {
    assign(orderId: string): Assignment | null {
      const existing = assignments.get(orderId);
      if (existing) return existing;

      const order = orders.find((o) => o.id === orderId);
      if (!order) return null;

      const date = almatyDate(order.createdAt);
      const assignment = assignBranch(order, branches, (branchId) => load(branchId, date));

      assignments.set(orderId, assignment);
      if (assignment.branchId) {
        loads.set(loadKey(assignment.branchId, date), load(assignment.branchId, date) + 1);
      }
      return assignment;
    },

    load(branchId: string, date: string) {
      const branch = branches.find((b) => b.id === branchId);
      if (!branch) return null;
      return { branchId, date, assigned: load(branchId, date), limit: branch.dailyLimit };
    },
  };
}

export type Dispatch = ReturnType<typeof createDispatch>;
