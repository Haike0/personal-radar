import "server-only";
import { getSetting } from "@/lib/db";
import { deepseekProvider } from "./deepseek";
import { mockProvider } from "./mock";
import type { CompanionProvider } from "./types";

/** Provider registry. Keys stay on the Mac (Keychain / server env) and are never sent to the browser. */
export function provider(): CompanionProvider {
  return getSetting("ai_provider") === "deepseek" ? deepseekProvider : mockProvider;
}
