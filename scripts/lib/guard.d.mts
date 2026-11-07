export function hostname(host: string | null | undefined): string;
export function allowedHost(host: string | null | undefined, extra?: string[]): boolean;
export function checkRequest(
  req: { method?: string; path?: string; host?: string | null; forwardedHost?: string | null; origin?: string | null; secFetchSite?: string | null },
  extra?: string[],
): null | "host" | "origin";
