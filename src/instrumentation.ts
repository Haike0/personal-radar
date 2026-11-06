// Starts the reminder scheduler once per server process: every minute it asks /api/push/tick to send whatever is due.
// It goes through HTTP (not a direct import) so the notifier runs in the normal route-handler environment.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __radarTickToken?: string; __radarTimer?: ReturnType<typeof setInterval> };
  if (g.__radarTimer) return;
  g.__radarTickToken = crypto.randomUUID();
  const port = process.env.RADAR_PORT ?? process.env.PORT ?? "3210";
  let first = false;
  const run = () =>
    fetch(`http://127.0.0.1:${port}/api/push/tick`, { method: "POST", headers: { "x-radar-tick": g.__radarTickToken! } })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!first) { first = true; console.log(`[push] scheduler running: ${j.skipped ?? `${j.due ?? 0} due`}`); }
        if (j.sent?.length) console.log(`[push] sent ${j.sent.join(", ")}`);
        if (j.failed?.length) console.warn(`[push] failed ${j.failed.join(", ")}`);
        if (j.error) console.warn(`[push] tick error: ${j.error}`);
      })
      .catch(() => { /* server not listening yet */ });
  setTimeout(run, 15_000);
  g.__radarTimer = setInterval(run, 60_000);
}
