import http from 'node:http';
import { Ledger } from './ledger.js';

export const ledger = new Ledger();
ledger.createAccount('cash', 'USD', 1000);
ledger.createAccount('fees', 'USD', 0);

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const body = (req) => new Promise((resolve, reject) => { let data = ''; req.on('data', (c) => data += c); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } }); });

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost'); const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'POST' && parts[0] === 'accounts') { const b = await body(req); json(res, 201, ledger.createAccount(b.id, b.currency, b.initialBalance)); return; }
    if (req.method === 'POST' && parts[0] === 'rates') { const b = await body(req); ledger.setExchangeRate(b.from, b.to, b.rate); json(res, 201, { confirmation: 'Rate recorded' }); return; }
    if (req.method === 'POST' && parts[0] === 'transactions' && parts.length === 1) { const b = await body(req); json(res, 201, await ledger.transfer({ ...b, idempotencyKey: req.headers['idempotency-key'] ?? b.idempotencyKey })); return; }
    if (req.method === 'POST' && parts[0] === 'transactions' && parts[2] === 'reverse') { json(res, 201, await ledger.reverse(parts[1], req.headers['idempotency-key'])); return; }
    if (req.method === 'GET' && parts[0] === 'accounts' && parts[2] === 'transactions') { json(res, 200, ledger.getTransactions(parts[1])); return; }
    if (req.method === 'GET' && parts[0] === 'accounts') { json(res, 200, ledger.getAccount(parts[1])); return; }
    if (req.method === 'GET' && url.pathname === '/verify') { json(res, 200, ledger.verifyTotal(Number(url.searchParams.get('expected')), url.searchParams.get('currency') ?? 'USD')); return; }
    if (req.method === 'GET' && url.pathname === '/reconcile') { json(res, 200, ledger.reconcile()); return; }
    json(res, 404, { error: 'Not found' });
  } catch (error) { json(res, 400, { error: error.message }); }
});

if (process.argv[1] && process.argv[1].endsWith('src/server.js')) server.listen(process.env.PORT || 3000, () => console.log('Ledger API listening on port 3000'));
