function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  info: (message: string, meta?: unknown) => console.log(`[${ts()}] INFO  ${message}`, meta ?? ""),
  warn: (message: string, meta?: unknown) => console.warn(`[${ts()}] WARN  ${message}`, meta ?? ""),
  error: (message: string, meta?: unknown) => console.error(`[${ts()}] ERROR ${message}`, meta ?? ""),
};
