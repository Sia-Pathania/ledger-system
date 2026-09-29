import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';

const setup = () => { const l = new Ledger(); l.createAccount('a', 'USD', 100); l.createAccount('b', 'USD', 0); return l; };
test('transfers atomically and is idempotent', async () => { const l = setup(); const first = await l.transfer({ source: 'a', destination: 'b', amount: 25, idempotencyKey: 'x' }); const second = await l.transfer({ source: 'a', destination: 'b', amount: 25, idempotencyKey: 'x' }); assert.equal(first.transactionId, second.transactionId); assert.equal(l.getAccount('a').balance, 75); assert.equal(l.getAccount('b').balance, 25); });
test('concurrent transfers do not lose updates', async () => { const l = setup(); await Promise.all([...Array(4)].map((_, i) => l.transfer({ source: 'a', destination: 'b', amount: 10, idempotencyKey: String(i) }))); assert.equal(l.getAccount('a').balance, 60); assert.equal(l.getAccount('b').balance, 40); });
test('supports currency conversion and reversal', async () => { const l = new Ledger(); l.createAccount('a', 'USD', 100); l.createAccount('b', 'EUR', 0); l.setExchangeRate('USD', 'EUR', 0.9); const tx = await l.transfer({ source: 'a', destination: 'b', amount: 10 }); assert.equal(l.getAccount('b').balance, 9); await l.reverse(tx.transactionId); assert.equal(l.getAccount('a').balance, 100); assert.equal(l.getAccount('b').balance, 0); });
test('reports reconciliation and total verification', async () => { const l = setup(); await l.transfer({ source: 'a', destination: 'b', amount: 20 }); assert.equal(l.verifyTotal(100).balanced, true); assert.ok(l.reconcile().every((r) => r.balanced)); });
