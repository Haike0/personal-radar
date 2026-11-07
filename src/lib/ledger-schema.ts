// 说话算数账本: one row per promise. `ai*` is the model's suggestion (with the message that proves it),
// `verdict` is what the user confirmed. Only confirmed rows go on the share card.
export const LEDGER_SQL = `CREATE TABLE IF NOT EXISTS ledger(
  item_id INTEGER PRIMARY KEY, who TEXT, ai TEXT, reason TEXT,
  proof_mid TEXT, proof_ts TEXT, proof_sender TEXT, proof_text TEXT, checked_at TEXT,
  verdict TEXT, who_fixed TEXT, decided_at TEXT)`;
