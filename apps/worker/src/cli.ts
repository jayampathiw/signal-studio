#!/usr/bin/env node
import { parseFlags, requireFlag } from './args.ts';
import { runJob } from './commands/run-job.ts';
import { runLocal } from './commands/run-local.ts';
import { uploadCommand } from './commands/upload.ts';
import { validateCommand } from './commands/validate.ts';
import { workerCommand } from './commands/worker.ts';
import { realRunJobDeps, realRunLocalDeps, realUploadDeps, realWorkerDeps } from './deps.ts';
import { createLogger, type LogLevel } from './logger.ts';

/**
 * P2.5 — the `ss` CLI's real command set (`validate`, `run-local`,
 * `run-job`, `upload`, `worker`). `packages/core/src/cli/ss.ts` (P1.1) stays
 * as a lighter, dependency-free `validate`-only tool; this is the one
 * `docker/Dockerfile`'s `ENTRYPOINT` now points at (P2.6 predates this and
 * pointed at core's), since only this package can depend on
 * `@signal-studio/db`/`@signal-studio/providers`/the render/template
 * packages without creating the cycle `packages/core` deliberately avoids.
 */

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  const logger = createLogger({
    level: (typeof flags.level === 'string' ? flags.level : 'info') as LogLevel,
    json: flags.json === true,
  });

  switch (command) {
    case 'validate':
      return validateCommand(
        rest.find((a) => !a.startsWith('--')),
        logger,
      );

    case 'run-local': {
      const result = await runLocal(
        {
          manifestPath: requireFlag(flags, 'manifest'),
          projectPath: requireFlag(flags, 'project'),
          outDir: requireFlag(flags, 'out'),
          workDir: typeof flags['work-dir'] === 'string' ? flags['work-dir'] : undefined,
          contentId: typeof flags['content-id'] === 'string' ? flags['content-id'] : undefined,
        },
        realRunLocalDeps(),
        logger,
      );
      logger.info('done', { outputs: result.outputs });
      return 0;
    }

    case 'run-job': {
      await runJob({ jobId: requireFlag(flags, 'id') }, realRunJobDeps(), logger);
      return 0;
    }

    case 'upload': {
      await uploadCommand(
        {
          jobId: requireFlag(flags, 'job'),
          shotId: requireFlag(flags, 'shot'),
          filePath: requireFlag(flags, 'file'),
        },
        realUploadDeps(),
        logger,
      );
      return 0;
    }

    case 'worker': {
      const jobDeps = realRunJobDeps();
      await workerCommand(
        {
          queue: typeof flags.queue === 'string' ? flags.queue : 'render-jobs',
          connectionString: requireFlag(flags, 'connection-string'),
        },
        realWorkerDeps((jobId) => runJob({ jobId }, jobDeps, logger)),
        logger,
      );
      return 0;
    }

    default:
      logger.error(`Unknown command: ${command ?? '(none)'}`, {
        available: ['validate <manifest.json>', 'run-local', 'run-job', 'upload', 'worker'],
      });
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
