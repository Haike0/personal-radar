import type { DatabaseSync } from "node:sqlite";

export interface Service { id: string; name: string; baseUrl: string; models: string[]; builtin?: boolean; fromEnv?: boolean; keyUrl?: string }
export interface Preset { id: string; name: string; baseUrl: string; models: string[]; keyUrl: string }
export type Role = "chat" | "fast";
export interface Resolved { service: Service; model: string; key: string | null; url: string; extra: Record<string, unknown> }
type Get = (key: string) => string | null | undefined;
type Env = Record<string, string | undefined>;

export const PRESETS: Preset[];
export function trimUrl(u: string | null | undefined): string;
export function isLocalUrl(u: string): boolean;
export function extraFor(baseUrl: string): Record<string, unknown>;
export function readKeys(dataDir: string): Record<string, string>;
export function writeKey(dataDir: string, id: string, key: string): void;
export function envService(env: Env): Service | null;
export function listServices(get: Get, env: Env): Service[];
export function keyFor(service: Service, dataDir: string, env: Env): string | null;
export function choiceOf(get: Get, env: Env, role: Role): { serviceId: string; model: string };
export function resolveRole(get: Get, env: Env, dataDir: string, role: Role): Resolved;
export function migrateLegacy(d: DatabaseSync, dataDir: string): void;
