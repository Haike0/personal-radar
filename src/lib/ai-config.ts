import "server-only";
import { getSetting } from "./db";
import { privacyConfig, outbound } from "../../scripts/lib/redact.mjs";

// What may leave the computer. Which AI service is used (and its key) is in src/lib/ai/model.ts.

/** Privacy rules as saved in settings. */
export const privacy = () => privacyConfig((k: string) => getSetting(k));
/** The last step before anything is sent: drop blacklisted lines, redact the rest. */
export const scrub = (text: string) => outbound(text, privacy()).text;
export const isExcluded = (sessionId: string) => privacy().excluded.has(sessionId);
