---
name: pharos-invoice-to-payment
description: Deterministically extract, reconcile, verify, and prepare unsigned native PROS invoice payments on Pharos Pacific Mainnet.
---

# Pharos Invoice-to-Payment

Use this skill when a user supplies a plain-text or supported JSON invoice and wants a preparation-only Pharos payment artifact.

1. Run `npm run cli -- <invoice-file> <text|json>` for deterministic extraction.
2. Treat every reported issue or mismatch as blocking. Never infer a missing payee, reference, amount, asset, or network.
3. Use the deployed application for official MCP verification and preparation. Only `native:1672` / PROS is supported.
4. Require the exact human-review statement shown by the UI before preparation.
5. Describe output as `PREPARED UNSIGNED / NOT BROADCAST`. Never request a key, sign, or broadcast.

The reference encoding is UTF-8 `PHAROS-INVOICE/1:<invoice-reference>` in native transaction `data`. ERC-20 preparation is intentionally unsupported because no verified reference-bearing route is configured.
