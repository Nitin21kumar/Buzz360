import cors from "cors";
import express, { Express } from "express";
import helmet from "helmet";

import { config } from "./core/config";
import { errorHandler } from "./core/errors";
import { checkPostgresConnection } from "./db/pool";
import { whatsappRouter } from "./modules/whatsapp/router";
import { rcsRouter } from "./modules/rcs/router";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: config.allowedOrigins.includes("*") ? true : config.allowedOrigins,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (_req, res) => {
    res.json({ service: "WhatsApp Service", status: "running" });
  });

  app.get("/health", async (_req, res) => {
    res.json({ status: "ok", postgres_connected: await checkPostgresConnection() });
  });

  app.use("/api/whatsapp", whatsappRouter);
  app.use("/api/rcs", rcsRouter);

  app.use(errorHandler);

  return app;
}
