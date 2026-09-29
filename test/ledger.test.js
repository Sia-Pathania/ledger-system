import test from 'node:test';
import assert from 'node:assert/strict';
import { Ledger } from '../src/ledger.js';

const setup = () => {
  const ledger = new Ledger();
  ledger.createAccount('a', 'USD', 100);
  ledger.createAccount('b', 'USD', 0);
  return ledger;
};

test('transfers atomically and is idempotent', async () => {
  const ledger = setup();
  const first = await ledger.transfer({ source: 'a', destination: 'b', amount: 25, idempotencyKey: 'x' });
  const second = await ledger.transfer({ source: 'a', destination: 'b', amount: 25, idempotencyKey: 'x' });

  assert.equal(first.transactionId, second.transactionId);
  assert.equal(ledger.getAccount('a').balance, 75);
  assert.equal(ledger.getAccount('b').balance, 25);
});

test('concurrent transfers do not lose updates', async () => {
  const ledger = setup();
  await Promise.all([...Array(4)].map((_, index) => ledger.transfer({
    source: 'a',
    destination: 'b',
    amount: 10,
    idempotencyKey: String(index),
  })));

  assert.equal(ledger.getAccount('a').balance, 60);
  assert.equal(ledger.getAccount('b').balance, 40);
});

test('supports currency conversion and reversal', async () => {
  const ledger = new Ledger();
  ledger.createAccount('a', 'USD', 100);
  ledger.createAccount('b', 'EUR', 0);
  ledger.setExchangeRate('USD', 'EUR', 0.9);

  const transaction = await ledger.transfer({ source: 'a', destination: 'b', amount: 10 });
  assert.equal(ledger.getAccount('b').balance, 9);

  await ledger.reverse(transaction.transactionId);
  assert.equal(ledger.getAccount('a').balance, 100);
  assert.equal(ledger.getAccount('b').balance, 0);
});

test('reports reconciliation and total verification', async () => {
  const ledger = setup();
  await ledger.transfer({ source: 'a', destination: 'b', amount: 20 });

  assert.equal(ledger.verifyTotal(100).balanced, true);
  assert.ok(ledger.reconcile().every((result) => result.balanced));
});
