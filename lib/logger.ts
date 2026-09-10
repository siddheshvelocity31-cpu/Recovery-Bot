type Level = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function emit(level: Level, msg: string, ctx?: LogContext): void {
  const entry = JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() });
  if (level === "error" || level === "warn") {
    process.stderr.write(entry + "\n");
  } else {
    process.stdout.write(entry + "\n");
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};
