import type { CorsOptions } from "cors";

export const productionWebOrigins = new Set([
  "https://app.nahreo.com",
  "https://clubhub.gameinsights.com.au",
]);

export function isCorsOriginAllowed(
  origin: string | undefined,
  environment = process.env.NODE_ENV,
): boolean {
  return (
    environment !== "production" ||
    origin === undefined ||
    productionWebOrigins.has(origin)
  );
}

export const corsOrigin: NonNullable<CorsOptions["origin"]> = (
  origin,
  callback,
) => {
  callback(null, isCorsOriginAllowed(origin));
};