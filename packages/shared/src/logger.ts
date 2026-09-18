import pino, { type Logger } from 'pino';

// Pretty output in interactive/dev sessions; structured JSON everywhere CI or
// production would want to parse it (matches other packages' env-driven
// behavior, e.g. packages/ai's proxy mode switch).
const isProd = process.env.NODE_ENV === 'production' || process.env.CI === 'true';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

// One child logger per pipeline stage (e.g. `stageLogger('render')`) so log
// lines are attributable without every call site passing its own bindings.
export function stageLogger(stage: string): Logger {
  return logger.child({ stage });
}
