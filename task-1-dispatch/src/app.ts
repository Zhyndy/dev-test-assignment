// @rev kc-31
import { createServer, type ServerResponse } from 'node:http';
import type { Branch, Order } from './types.ts';
import { isValidDate, type Dispatch } from './dispatch.ts';

export function createApp(dispatch: Dispatch, branches: Branch[], orders: Order[]) {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);

    try {
      if (req.method === 'GET' && url.pathname === '/branches') {
        return send(res, 200, branches);
      }

      if (req.method === 'GET' && parts[0] === 'orders' && parts.length === 2) {
        const order = orders.find((o) => o.id === parts[1]);
        if (!order) return send(res, 404, { error: 'order_not_found' });
        return send(res, 200, order);
      }

      if (req.method === 'POST' && parts[0] === 'orders' && parts[2] === 'assign' && parts.length === 3) {
        const assignment = dispatch.assign(parts[1]);
        if (!assignment) return send(res, 404, { error: 'order_not_found' });
        return send(res, 200, assignment);
      }

      if (req.method === 'GET' && parts[0] === 'branches' && parts[2] === 'load' && parts.length === 3) {
        const date = url.searchParams.get('date');
        if (!date || !isValidDate(date)) return send(res, 400, { error: 'invalid_date' });
        const load = dispatch.load(parts[1], date);
        if (!load) return send(res, 404, { error: 'branch_not_found' });
        return send(res, 200, load);
      }

      send(res, 404, { error: 'not_found' });
    } catch (err) {
      console.error(err);
      send(res, 500, { error: 'internal' });
    }
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
