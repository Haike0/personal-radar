# Contributing

- Read and agree to the [CLA](CLA.md) — your first pull request needs it.
- Never put real chat logs, names, phone numbers, ids or API keys in issues, pull requests or test files. Use the fictional
  samples in `examples/` or the demo data in `demo/`.
- Run `sh scripts/install-hooks.sh` once: it adds a pre-commit check that blocks obvious personal data.
- Before opening a pull request: `npx tsc --noEmit && npm run lint && npm run build`.
- New import formats are very welcome (KakaoTalk, Telegram, Messenger, iMessage…): add a parser to `scripts/import.mjs`
  and a small fictional sample to `examples/`.
