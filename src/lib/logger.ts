/**
 * Minimal structured logger. Emits one JSON object per line so logs are
 * machine-parseable in production (log drains / aggregation) while staying
 * readable in dev. Route server-side diagnostics through this instead of bare
 * console.* calls.
 *
 * SECURITY: never pass raw passwords, tokens, full biodata, or connection
 * strings in `fields`. Log identifiers, event names, and error *messages* only —
 * mirroring the audit-log rule. Use `errMessage()` to extract a safe string from
 * a caught value rather than spreading the whole Error.
 */
type Level = 'error' | 'warn' | 'info';

export interface LogFields {
  [key: string]: unknown;
}

/** Safe error string — never leaks stack frames or nested objects into logs. */
export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown_error';
}

function emit(level: Level, event: string, fields?: LogFields): void {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
};
