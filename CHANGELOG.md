# Changelog

## 7.1.0

- Refund withdrawals rejected definitively by Lightning, including the fee reserve. Keep ambiguous payment outcomes reserved until settlement or failure is established.
- Prevent duplicate wallet credits and withdrawals when Lightning callbacks repeat, payment responses are lost, or settlement is reconciled after a restart. Wallet balances and settlement records now change atomically.
- Add an optional `idempotencyKey` to `payUser` so retries return the original payout without transferring funds again. Reusing a key with a different recipient, amount, or description returns HTTP 409. Clients must persist and reuse the same key and payout payload, including the description, for every retry; requests without a key remain unsafe to retry.
- Include additive database migrations for unique Lightning payment identities and payout idempotency. Apply migrations before starting the updated server; resolve any existing duplicate Lightning payment identities before migration.
