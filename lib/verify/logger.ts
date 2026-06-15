type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  ts: string;
  level: LogLevel;
  ctx: string;
  msg: string;
  data?: Record<string, unknown>;
}

function emit(entry: LogEntry): void {
  const line = JSON.stringify(entry);
  switch (entry.level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      if (process.env.NODE_ENV !== "production") console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export function createLogger(context: string) {
  const log = (level: LogLevel, msg: string, data?: Record<string, unknown>) =>
    emit({ ts: new Date().toISOString(), level, ctx: context, msg, ...(data && { data }) });

  return {
    info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),
    debug: (msg: string, data?: Record<string, unknown>) => log("debug", msg, data),
  };
}
