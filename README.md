# Internal Ledger System

A small JavaScript/Node.js financial ledger API. It records transfers as balanced accounting events, maintains account balances, supports reversals and currency conversion, and provides reconciliation checks.

## Requirements

- Node.js 18 or later
- No external runtime dependencies

## Run

```bash
npm test
npm start
```

The API listens on port 3000. Create accounts with `POST /accounts`, set FX rates with `POST /rates`, and transfer with `POST /transactions` using `{ "source", "destination", "amount" }`. An `Idempotency-Key` header prevents duplicate submissions.

## Example

Start the API:

```bash
npm start
```

Create a transfer:

```bash
curl -X POST http://localhost:3000/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: transfer-001" \
  -d '{"source":"cash","destination":"fees","amount":100}'
```

Run the automated checks with:

```bash
npm test
```

Additional endpoints: `GET /accounts/:id`, `GET /accounts/:id/transactions`, `POST /transactions/:id/reverse`, `GET /verify?expected=100&currency=USD`, and `GET /reconcile`.

## Design assumptions

The following assumptions define how this ledger behaves:

- Every transfer represents a balanced accounting event: the source account is debited and the destination account is credited for the same value. A transaction is accepted only when the debit and credit balance.
- Amounts are positive and are rounded to two decimal places. A production system should store money as integer cents or use a decimal-money library to avoid floating-point precision issues.
- Transaction IDs are UUID strings. They are identifiers, not amounts, and UUIDs avoid collisions without relying on a sequential counter.
- Account IDs and currency codes are strings, balances and amounts are JavaScript numbers, transactions are objects, transaction history is an array, and accounts are stored in a `Map`.
- The service is designed for a single Node.js event loop and does not use application-level multithreading. The atomic operation serializes balance updates within the process.
- A transfer fails if the source account does not have enough balance, either account does not exist, the accounts are the same, or a required exchange rate is missing.
- Duplicate requests are identified by an `Idempotency-Key` header. Repeating the same key returns the original result and does not create another transfer.
- Cross-currency transfers debit the source amount and credit the destination using the configured exchange rate. The converted amount is recorded on the transaction.
- Reversals create a new correction transaction rather than deleting the original transaction. An original transfer can only be reversed once.
- The current implementation uses in-memory storage, so data is lost when the server restarts. A production implementation should use a transactional database with durable storage.
- The included default accounts (`cash` and `fees`) exist only to make the API easy to demonstrate locally; production account data would come from persistent storage.
