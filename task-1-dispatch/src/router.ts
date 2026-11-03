// @rev kc-31
import type { Assignment, Branch, Order, Rule } from './types.ts';
import { distanceKm } from './geo.ts';

// Сколько заказов уже закреплено за филиалом в сутки заказа
export type LoadOf = (branchId: string) => number;

export function assignBranch(order: Order, branches: Branch[], loadOf: LoadOf = () => 0): Assignment {
  const own = branches.filter((b) => b.storeId === order.storeId && b.active);
  const result = (branch: Branch | null, rule: Rule): Assignment => ({
    orderId: order.id,
    branchId: branch?.id ?? null,
    rule,
  });

  if (order.manualBranchId) {
    const manual = own.find((b) => b.id === order.manualBranchId);
    if (manual) return result(manual, 'manual');
  }

  const picked = pickByRules(order, own);
  if (!picked) return result(null, 'unassigned');

  const isFull = (b: Branch) => loadOf(b.id) >= b.dailyLimit;
  if (!isFull(picked.branch)) return result(picked.branch, picked.rule);

  const fallback = findNearest(order, own.filter((b) => !isFull(b)));
  return fallback ? result(fallback, 'geo') : result(null, 'unassigned');
}

function pickByRules(order: Order, own: Branch[]): { branch: Branch; rule: Rule } | null {
  if (own.length === 1) return { branch: own[0], rule: 'single' };

  if (order.pickupPointId) {
    const byPoint = own.find((b) => b.pickupPointIds.includes(order.pickupPointId!));
    if (byPoint) return { branch: byPoint, rule: 'pickup_point' };
  }

  const inCity = own.filter((b) => b.city === order.city);
  if (inCity.length === 1) return { branch: inCity[0], rule: 'city' };

  const nearest = findNearest(order, inCity.length > 1 ? inCity : own);
  if (nearest) return { branch: nearest, rule: 'geo' };

  return null;
}

function findNearest(order: Order, branches: Branch[]): Branch | null {
  if (order.lat === null || order.lon === null) return null;

  let best: Branch | null = null;
  let bestDist = Infinity;
  for (const b of branches) {
    const d = distanceKm(order.lat, order.lon, b.lat, b.lon);
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}
