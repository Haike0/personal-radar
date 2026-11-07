# Security

Personal Radar handles private conversations, so security reports are very welcome.

**Report privately:** open a [GitHub security advisory](https://github.com/Ikarishinji00/personal-radar/security/advisories/new) for this repository. Please don't open a public issue for a vulnerability, and never include real chat content in a report.

**Design boundaries**
- The server listens on `localhost` by default and has no login. Exposing it to the internet without your own access control (e.g. Tailscale, Cloudflare Access) is unsafe.
- Chats are read-only; Radar writes only to its own data folder.
- API keys are stored locally and never sent to the browser.
- Content sent to an AI service passes through the redaction rules at the last step; the preview shows exactly what would be sent.
