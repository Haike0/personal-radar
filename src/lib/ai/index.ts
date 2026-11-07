import "server-only";
import { getSetting } from "@/lib/db";
import { DEMO_ONLY } from "@/lib/config";
import { deepseekProvider } from "./deepseek";
import { mockProvider } from "./mock";
import type { CompanionProvider } from "./types";

/** Provider registry. Keys stay on the Mac (Keychain / server env) and are never sent to the browser. */
export function provider(): CompanionProvider {
  return !DEMO_ONLY && getSetting("ai_provider") === "deepseek" ? deepseekProvider : mockProvider;
}
