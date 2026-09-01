import { createApp } from "./app";
import { config, validateConfigForProduction } from "./core/config";
import { logger } from "./core/logger";
import { ensureIndexes } from "./db/collections";
import * as whatsappService from "./modules/whatsapp/service";
import * as rcsService from "./modules/rcs/service";

const STALE_SWEEP_INTERVAL_MS = 15 * 60_000;

async function main() {
  validateConfigForProduction();
  await ensureIndexes();

  const app = createApp();
  app.listen(config.port, () => {
    logger.info(`WhatsApp service listening on port ${config.port} (${config.environment})`);
  });

  await whatsappService.resumeInterruptedCampaigns().catch((e) => logger.error("WhatsApp resume failed", e));
  await rcsService.resumeInterruptedCampaigns().catch((e) => logger.error("RCS resume failed", e));

  const sweep = () => {
    whatsappService.sweepStaleSent().catch((e) => logger.error("WhatsApp stale sweep failed", e));
    rcsService.sweepStaleSent().catch((e) => logger.error("RCS stale sweep failed", e));
  };
  setInterval(sweep, STALE_SWEEP_INTERVAL_MS).unref();
  sweep();
}

main().catch((err) => {
  logger.error("Fatal startup error", err);
  process.exit(1);
});
