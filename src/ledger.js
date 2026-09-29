import crypto from 'node:crypto';

const money = (value) => Math.round(Number(value) * 100) / 100;

export class Ledger {
  constructor({ exchangeRates = {} } = {}) {
    this.accounts = new Map();
    this.transactions = [];
    this.idempotency = new Map();
    this.exchangeRates = new Map(Object.entries(exchangeRates));
    this.lock = Promise.resolve();
  }

  async atomic(fn) {
    let release;
    const next = new Promise((resolve) => { release = resolve; });
    const previous = this.lock;
    this.lock = next;
    await previous;
    try { return await fn(); } finally { release(); }
  }

  createAccount(id, currency = 'USD', initialBalance = 0) {
    if (this.accounts.has(id)) throw new Error('Account already exists');
    if (!Number.isFinite(initialBalance) || initialBalance < 0) throw new Error('Invalid initial balance');
    this.accounts.set(id, { id, currency, balance: money(initialBalance), openingBalance: money(initialBalance) });
    return this.accounts.get(id);
  }

  setExchangeRate(from, to, rate) {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid exchange rate');
    this.exchangeRates.set(`${from}:${to}`, rate);
  }

  rate(from, to) {
    if (from === to) return 1;
    const value = this.exchangeRates.get(`${from}:${to}`);
    if (!value) throw new Error(`Missing exchange rate for ${from}/${to}`);
    return value;
  }

  async transfer({ source, destination, amount, idempotencyKey, timestamp = new Date().toISOString() }) {
    return this.atomic(() => {
      if (idempotencyKey && this.idempotency.has(idempotencyKey)) return this.idempotency.get(idempotencyKey);
      if (source === destination) throw new Error('Source and destination must differ');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be positive');
      const from = this.accounts.get(source); const to = this.accounts.get(destination);
      if (!from || !to) throw new Error('Account not found');
      if (from.balance < amount) throw new Error('Insufficient balance');
      const converted = money(amount * this.rate(from.currency, to.currency));
      const tx = { id: crypto.randomUUID(), type: 'TRANSFER', source, destination, amount: money(amount), convertedAmount: converted, currency: from.currency, destinationCurrency: to.currency, timestamp, idempotencyKey: idempotencyKey ?? null };
      from.balance = money(from.balance - amount); to.balance = money(to.balance + converted);
      this.transactions.push(tx);
      const result = { transactionId: tx.id, confirmation: 'Transaction recorded', transaction: tx };
      if (idempotencyKey) this.idempotency.set(idempotencyKey, result);
      return result;
    });
  }

  async reverse(transactionId, idempotencyKey) {
    return this.atomic(() => {
      const original = this.transactions.find((t) => t.id === transactionId);
      if (!original || original.type !== 'TRANSFER') throw new Error('Transfer not found');
      if (this.transactions.some((t) => t.type === 'REVERSAL' && t.reverses === transactionId)) throw new Error('Transaction already reversed');
      const result = this._reverse(original, idempotencyKey);
      if (idempotencyKey) this.idempotency.set(idempotencyKey, result);
      return result;
    });
  }

  _reverse(tx, idempotencyKey) {
    const source = this.accounts.get(tx.source); const destination = this.accounts.get(tx.destination);
    if (destination.balance < tx.convertedAmount) throw new Error('Insufficient balance for reversal');
    source.balance = money(source.balance + tx.amount); destination.balance = money(destination.balance - tx.convertedAmount);
    const reversal = { id: crypto.randomUUID(), type: 'REVERSAL', reverses: tx.id, source: tx.destination, destination: tx.source, amount: tx.convertedAmount, convertedAmount: tx.amount, currency: tx.destinationCurrency, destinationCurrency: tx.currency, timestamp: new Date().toISOString(), idempotencyKey: idempotencyKey ?? null };
    this.transactions.push(reversal);
    return { transactionId: reversal.id, confirmation: 'Reversal recorded', transaction: reversal };
  }

  getAccount(id) { const account = this.accounts.get(id); if (!account) throw new Error('Account not found'); return { ...account }; }
  getTransactions(id) { if (!this.accounts.has(id)) throw new Error('Account not found'); return this.transactions.filter((t) => t.source === id || t.destination === id).sort((a, b) => a.timestamp.localeCompare(b.timestamp)); }

  verifyTotal(expectedTotal, currency = 'USD') {
    const total = money([...this.accounts.values()].filter((a) => a.currency === currency).reduce((sum, a) => sum + a.balance, 0));
    return { currency, expected: money(expectedTotal), actual: total, discrepancy: money(total - expectedTotal), balanced: total === money(expectedTotal) };
  }

  reconcile() {
    return [...this.accounts.values()].map((account) => {
      const calculated = money(account.openingBalance + this.transactions.reduce((sum, t) => {
        if (t.destination === account.id) return sum + t.convertedAmount;
        if (t.source === account.id) return sum - t.amount;
        return sum;
      }, 0));
      return { accountId: account.id, recordedBalance: account.balance, calculatedBalance: calculated, balanced: account.balance === calculated };
    });
  }
}
