// src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level:
    process.env.LOG_LEVEL || process.env.NODE_ENV === "development"
      ? "debug"
      : "info",
});
