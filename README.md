# Pharos Invoice-to-Payment Agent

An evidence-backed invoice reconciliation desk that deterministically extracts invoices, exposes field provenance and mismatches, verifies native-payment facts through the official Pharos MCP, requires human review, and produces an unsigned transaction. It never connects a wallet, signs, broadcasts, or claims payment completion.

- Public demo: <https://pharos-invoice-to-payment-agent.shoupeorg.workers.dev>
- Versioned public evidence: <https://pharos-invoice-to-payment-agent.shoupeorg.workers.dev/evidence/v1.0/manifest.json>

## Supported inputs

- Plain-text labeled invoices with documented label aliases and arbitrary field order.
- Structured JSON using the sample schema and documented alternate property paths.

Both normalize to invoice reference, payee, exact decimal amount, asset ID, token label, chain ID, network, and optional payer/issuer/due date. Every value retains its text excerpt/span or JSON property path. Missing, conflicting, ambiguous, malformed, unsupported, zero, or out-of-range values block preparation.

The optional expected-payment JSON is a reconciliation check, not an automatic correction mechanism. Differences show invoice value versus expected value and block preparation. To correct an invoice, edit the source explicitly; the displayed original source, new extraction, and a fresh human confirmation make the final value auditable. Conflicting source values are never silently repaired.

## Supported payment route

Only native PROS on Pharos Pacific Mainnet (`chainId 1672`, `assetId native:1672`, 18 decimals) is supported. The official MCP verifies chain ID and pinned recipient bytecode. A successful empty-bytecode read establishes an EOA; a failed read remains unavailable and blocks preparation. Gas and fees are shown only when returned.

The unsigned native transaction stores UTF-8 `PHAROS-INVOICE/1:<reference>` in `tx.data`. The decoder proves destination, atomic amount, reference, and chain ID round-trip. ERC-20 is blocked because `transfer(address,uint256)` has no reference argument and no verified reference-bearing payment contract or safe trailing-data convention is configured.

## Safety and privacy

- Exact decimal-to-integer conversion uses `BigInt`, never floating point.
- Human review is required and any material input edit invalidates it.
- Canonical fingerprints deduplicate repeated preparation inside an isolated anonymous D1 workspace; prior preparation is not proof of payment.
- User invoices are not published globally. Public evidence contains samples only.
- Exports explicitly say `UNSIGNED / NOT BROADCAST` and contain no secrets or signatures.

## Commands

```bash
npm install
npm test
npm run build
npm run cli -- public/samples/plain-text-invoice.txt text
```

## Samples and evidence

- [`public/samples/plain-text-invoice.txt`](public/samples/plain-text-invoice.txt)
- [`public/samples/structured-invoice.json`](public/samples/structured-invoice.json)
- [`public/samples/missing-field-invoice.txt`](public/samples/missing-field-invoice.txt)
- `public/evidence/v1.0/` is generated only from the public samples through the deployed API. It contains two prepared unsigned records and their exact exports plus blocked mismatch and missing-field results. No private workspace capability is published.

## API

Create an anonymous workspace with `POST /api/workspaces`, then send its ID and capability in `x-workspace-id` and `x-workspace-capability`. The shared engine powers `/api/extract`, `/api/verify`, `/api/prepare`, `/api/history`, CLI, and UI. The exact confirmation string is `I reviewed the recipient, amount, asset, network, and reference`.

## Limitations

Extraction is deterministic, not arbitrary natural-language understanding. PDF/OCR, ERC-20 preparation, wallet connection, signing, nonce selection, broadcasting, and payment-status detection are out of scope. Gas estimation can be unavailable when the optional payer lacks funds or the RPC cannot estimate; that limitation is reported rather than fabricated.
