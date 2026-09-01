import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy must be mounted before the body parsers.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// Image uploads (team banners, post photos) arrive as base64 JSON, client-
// resized first. Budget: up to 6 post photos x 4MB binary ≈ 32MB base64, so
// the aggregate body limit must sit above that.
app.use(express.json({ limit: "36mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
    // Dev only: tolerate large client clock drift. A client whose clock runs
    // slow presents session tokens the (correct) server clock sees as already
    // expired, locking the user out. Keep production strict (default 5s).
    ...(process.env.NODE_ENV !== "production"
      ? { clockSkewInMs: 30 * 60 * 1000 }
      : {}),
  })),
);

app.use("/api", router);

export default app;
