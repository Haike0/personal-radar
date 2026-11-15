# Agent setup runbook

**给不会编程的人：** 把这个文件交给你的 AI 编程助手（Claude Code、Codex、Cursor 等），对它说「照 AGENT_SETUP.md 帮我在这台电脑上装好 ReadMe」。它会一步步装好、设成开机自动运行，最后打开网页交给你。API 密钥你自己在网页里填，不要发给它。

**For the agent:** install ReadMe on the user's own computer and hand over a running app. Work through the phases in order, verify each one, and report in the user's language.

## Rules
- Never ask the user to paste API keys, tokens or passwords into the chat. They enter them in the app (Settings → AI). Do not read `keys.json` or `radar.db`.
- No `sudo` / admin installs without asking first. Prefer user-level installs.
- Do not change system settings beyond what a phase says (a login item / user service is fine).
- Data lives in `~/.personal-radar` (override with `RADAR_DATA_DIR`). Never delete it.

## 1. Node.js 22.13+
`node -v`. If missing or older:
- macOS: `brew install node` if Homebrew exists; otherwise ask the user to run the installer from https://nodejs.org (LTS).
- Windows: `winget install OpenJS.NodeJS.LTS`
- Linux: install via nvm (`nvm install --lts`).
Verify: `node -e "require('node:sqlite')"` exits without error.

## 2. Get the code and build
```bash
git clone https://github.com/Haike0/personal-radar.git ~/personal-radar
cd ~/personal-radar
npm ci                 # also builds the app (the prepare step)
npx next build
```

## 3. First start and check
```bash
npm run serve          # serves http://localhost:3210 (npm start does the same and also opens the browser)
curl -s http://localhost:3210/api/health   # expect JSON
```
Stop it again before phase 4.

## 4. Keep it running (starts at login)
Always keep `-H 127.0.0.1`: without it the server answers anyone on the same Wi-Fi. The phone goes through Tailscale (phase 5), not the open network.
Reminders are sent by this server, so it must be running.

**macOS** — write `~/Library/LaunchAgents/local.personal-radar.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>local.personal-radar</string>
  <key>ProgramArguments</key><array>
    <string>NODE_PATH_HERE</string><string>node_modules/next/dist/bin/next</string><string>start</string><string>-p</string><string>3210</string><string>-H</string><string>127.0.0.1</string>
  </array>
  <key>WorkingDirectory</key><string>REPO_PATH_HERE</string>
  <key>EnvironmentVariables</key><dict><key>NODE_ENV</key><string>production</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/personal-radar.log</string><key>StandardErrorPath</key><string>/tmp/personal-radar.log</string>
</dict></plist>
```
Replace `NODE_PATH_HERE` with `which node` and `REPO_PATH_HERE` with the absolute repo path, then `launchctl load ~/Library/LaunchAgents/local.personal-radar.plist`.
Tell the user: if the Mac sleeps, reminders wait until it wakes (System Settings → Battery/Energy → prevent automatic sleeping, if they want them on time).

**Linux** — a user unit `~/.config/systemd/user/personal-radar.service` with `WorkingDirectory=<repo>`, `ExecStart=<node> node_modules/next/dist/bin/next start -p 3210 -H 127.0.0.1`, `Environment=NODE_ENV=production`, `Restart=always`; then `systemctl --user enable --now personal-radar`.

**Windows** — `schtasks /Create /SC ONLOGON /TN PersonalRadar /TR "cmd /c cd /d <repo> && npm run serve"`.

**Docker (any OS, if Docker is installed)** — `docker compose up -d` in the repo; data goes to `./radar-data`.

## 5. Phone (optional)
ReadMe only answers localhost, 127.0.0.1 and `*.ts.net` host names. If you put it behind any other name, add it to `RADAR_ALLOWED_HOSTS` (comma-separated, `*.example` allowed) in the service environment.
Only if the user wants ReadMe on their phone. Install Tailscale on the computer and phone (same account). The user enables MagicDNS and HTTPS certificates once in the Tailscale admin console (they must click it themselves). Then `tailscale serve --bg 3210` and give them the `https://<machine>.<tailnet>.ts.net` address. On the phone: open it in Safari/Chrome → Add to Home Screen → open from the icon → Settings → turn on notifications.

## 6. Hand over
Open http://localhost:3210. The user sees the welcome page and does the rest in the browser: import chats, pick an AI service and paste their own key, set privacy, organize. Tell them where the data lives and how to update.

## Updating
```bash
cd ~/personal-radar && git pull && npm ci && npx next build
```
then restart the service (macOS: `launchctl kickstart -k gui/$(id -u)/local.personal-radar`).

## Uninstall
Stop and remove the service, delete the repo folder. Their data stays in `~/.personal-radar` until they delete it (or use Settings → Data → Delete everything).
