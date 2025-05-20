import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  spyOn,
  test,
} from 'bun:test';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import * as initModule from '@/src/commands/init';
import * as loginModule from '@/src/commands/login';
import * as typesModule from '@/src/commands/types';
import { run } from '@/src/index';
import * as infoModule from '@/src/utils/info';
import * as miscModule from '@/src/utils/misc';
import * as modelModule from '@/src/utils/model';
import { type ModelWithFieldsArray, convertObjectToArray } from '@/src/utils/model';
import * as sessionModule from '@/src/utils/session';
import * as spaceModule from '@/src/utils/space';
import * as confirmModule from '@inquirer/prompts';
import * as selectModule from '@inquirer/prompts';
import type { Model } from '@ronin/compiler';
import * as getPort from 'get-port';
import * as open from 'open';

describe('CLI', () => {
  // Store original values
  const originalIsTTY = process.stdout.isTTY;
  const expectedHelpText = 'Data at the edge';

  let stdoutSpy: Mock<typeof console.log>;
  let stderrSpy: Mock<typeof process.stderr.write>;
  let exitSpy: Mock<typeof process.exit>;
  let writeFileSyncSpy: Mock<typeof fs.writeFileSync>;

  beforeEach(() => {
    // Spy on stdout/stderr
    stdoutSpy = spyOn(console, 'log').mockImplementation(() => {});
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = spyOn(process, 'exit').mockImplementation(() => undefined as never);
    spyOn(console, 'table').mockImplementation(() => {});
    spyOn(fs.promises, 'appendFile').mockImplementation(() => Promise.resolve());
    spyOn(sessionModule, 'getSession').mockImplementation(() =>
      Promise.resolve({
        token: 'Bulgur',
      }),
    );

    // Prevent actually reading/writing files.
    // @ts-expect-error This is a mock.
    spyOn(fs, 'readdirSync').mockReturnValue(['migration-0001.ts', 'migration-0002.ts']);
    writeFileSyncSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    spyOn(fs.promises, 'writeFile').mockResolvedValue();

    // Mock reading `.npmrc` and `bunfig.toml` as empty files
    // @ts-expect-error This is a mock.
    spyOn(fs.promises, 'readFile').mockImplementation((filePath) => {
      if (typeof filePath === 'string') {
        if (filePath.includes('.npmrc')) return Promise.resolve('');
        if (filePath.includes('bunfig.toml')) return Promise.resolve('');
        if (filePath.toString().includes('.gitignore'))
          return Promise.resolve('node_modules\n');
        if (filePath.toString().includes('tsconfig.json'))
          return Promise.resolve('{"compilerOptions":{"types":[]}}');
      }
      return Promise.resolve('{"token": "Bulgur"}');
    });
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY;
    delete process.env.RONIN_TOKEN;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('misc', () => {
    test('should break arg parse', async () => {
      process.argv = ['bun', 'ronin', '--invalid-flag'];
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      try {
        await run({ version: '1.0.0' });
      } catch {
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes("Unknown option '--invalid-flag'"),
          ),
        ).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(1);
      }
    });

    test('should handle SIGINT gracefully', async () => {
      process.argv = ['bun', 'ronin'];
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => 'Exited' as never);

      try {
        const runPromise = run({ version: '1.0.0' });
        process.emit('SIGINT');
        await Promise.race([
          runPromise,
          // Add timeout to prevent test hanging
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        expect(exitSpy).toHaveBeenCalledWith(1);
      }
    });

    test('should handle SIGTERM gracefully', async () => {
      process.argv = ['bun', 'ronin'];
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => 'Exited' as never);

      try {
        const runPromise = run({ version: '1.0.0' });
        process.emit('SIGTERM');
        await Promise.race([
          runPromise,
          // Add timeout to prevent test hanging
          new Promise((resolve) => setTimeout(resolve, 1000)),
        ]);
      } catch {
        expect(exitSpy).toHaveBeenCalledWith(1);
      }
    });

    test('should exit when running in non-interactive shell without app token', async () => {
      process.argv = ['bun', 'ronin'];
      process.stdout.isTTY = false;
      const exitSpy = spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      spyOn(sessionModule, 'getSession').mockResolvedValue(null);

      try {
        await run({ version: '1.0.0' });
      } catch {
        expect(exitSpy).toHaveBeenCalledWith(1);
      }
    });
  });

  describe('help', () => {
    test('should print help when --help flag is provided', async () => {
      process.argv = ['bun', 'ronin', '--help'];
      const helpSpy = spyOn(infoModule, 'printHelp');

      await run({ version: '1.0.0' });

      expect(helpSpy).toHaveBeenCalled();
      expect(
        stdoutSpy.mock.calls.some((call) => call[0].includes(expectedHelpText)),
      ).toBe(true);
    });

    test('should print version when --version flag is provided', async () => {
      process.argv = ['bun', 'ronin', '--version'];
      const versionSpy = spyOn(infoModule, 'printVersion');

      await run({ version: '1.0.0' });

      expect(stdoutSpy.mock.calls[0][0]).toBe('1.0.0');
      expect(versionSpy).toHaveBeenCalledWith('1.0.0');
    });

    test('should print help when no command is provided', async () => {
      process.argv = ['bun', 'ronin'];
      const helpSpy = spyOn(infoModule, 'printHelp');

      await run({ version: '1.0.0' });

      expect(helpSpy).toHaveBeenCalled();
      expect(
        stdoutSpy.mock.calls.some((call) => call[0].includes(expectedHelpText)),
      ).toBe(true);
    });
  });

  describe('starter', () => {
    describe('login', () => {
      test('should login when no token is provided', async () => {
        process.argv = ['bun', 'ronin', 'login'];
        const mockPort = 12345;

        spyOn(getPort, 'default').mockResolvedValue(mockPort);

        // Mock HTTP server
        const mockServer = {
          listen: () => mockServer,
          once: (
            event: string,
            callback: (req: http.IncomingMessage, res: http.ServerResponse) => void,
          ) => {
            if (event === 'request') {
              setTimeout(() => {
                callback(
                  { url: '/?token=Bulgur' } as http.IncomingMessage,
                  {
                    setHeader: () => {},
                    writeHead: () => ({ end: () => {} }),
                    end: () => {},
                  } as unknown as http.ServerResponse,
                );
              }, 10);
            }
            return mockServer;
          },
          close: () => {},
        };
        spyOn(http, 'createServer').mockReturnValue(mockServer as unknown as http.Server);
        spyOn(open, 'default').mockResolvedValue({} as unknown as ChildProcess);

        // Spy on session storage
        const storeSessionSpy = spyOn(sessionModule, 'storeSession');
        const storeTokenForNPMSpy = spyOn(sessionModule, 'storeTokenForNPM');
        const storeTokenForBunSpy = spyOn(sessionModule, 'storeTokenForBun');
        const writeFileSpy = spyOn(fs.promises, 'writeFile').mockResolvedValue();

        await run({ version: '1.0.0' });

        // Verify token storage
        expect(storeSessionSpy).toHaveBeenCalledWith('Bulgur');
        expect(storeTokenForNPMSpy).toHaveBeenCalledWith('Bulgur');
        expect(storeTokenForBunSpy).toHaveBeenCalledWith('Bulgur');

        // Verify file contents
        expect(
          writeFileSpy.mock.calls.some(
            (call) =>
              typeof call[1] === 'string' &&
              call[1].includes(JSON.stringify({ token: 'Bulgur' }, null, 2)),
          ),
        ).toBe(true);
        expect(
          writeFileSpy.mock.calls.some(
            (call) =>
              typeof call[1] === 'string' &&
              call[1].includes('https://ronin.supply\n//ronin.supply/:_authToken=Bulgur'),
          ),
        ).toBe(true);
        expect(
          writeFileSpy.mock.calls.some(
            (call) => typeof call[1] === 'string' && call[1].includes('token = "Bulgur"'),
          ),
        ).toBe(true);
        expect(exitSpy).toHaveBeenCalledWith(0);
      });

      test('should login when a token is provided', async () => {
        process.env.RONIN_TOKEN = 'Peaches';
        process.argv = ['bun', 'ronin', 'login'];

        // Mock file operations
        spyOn(fs.promises, 'writeFile').mockResolvedValue();
        spyOn(fs.promises, 'stat').mockResolvedValue({} as fs.Stats);

        // Spy on session storage
        const storeSessionSpy = spyOn(sessionModule, 'storeSession');
        const storeTokenForNPMSpy = spyOn(sessionModule, 'storeTokenForNPM');
        const storeTokenForBunSpy = spyOn(sessionModule, 'storeTokenForBun');
        const loginSpy = spyOn(loginModule, 'default');

        await run({ version: '1.0.0' });

        expect(loginSpy).toHaveBeenCalledWith('Peaches');
        expect(storeSessionSpy).not.toHaveBeenCalled();
        expect(storeTokenForNPMSpy).toHaveBeenCalledWith('Peaches');
        expect(storeTokenForBunSpy).toHaveBeenCalledWith('Peaches');
      });
    });

    describe('init', () => {
      test('should fail if no space handle is provided', async () => {
        process.argv = ['bun', 'ronin', 'init'];
        spyOn(spaceModule, 'getOrSelectSpaceId').mockReturnValue(
          Promise.resolve('spa_space'),
        );
        spyOn(modelModule, 'getModels').mockReturnValue(
          Promise.resolve([{ slug: 'test', fields: [] }]),
        );
        spyOn(typesModule, 'default').mockImplementation(() => Promise.resolve());

        await run({ version: '1.0.0' });

        expect(
          // @ts-expect-error This is a mock.
          stderrSpy.mock.calls.some((call) => call[0].includes('Project initialized')),
        ).toBe(true);
      });

      test('should fail if no package.json is found', async () => {
        process.argv = ['bun', 'ronin', 'init', 'my-space'];
        spyOn(fs.promises, 'access').mockImplementation(() => Promise.reject());

        spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });

        try {
          await run({ version: '1.0.0' });
        } catch (error) {
          expect(
            stderrSpy.mock.calls.some(
              (call) =>
                typeof call[0] === 'string' &&
                call[0].includes(
                  'No `package.json` found in the current directory. Please run the command in your project.',
                ),
            ),
          ).toBe(true);
          expect((error as Error).message).toBe('process.exit called');
          expect(exitSpy).toHaveBeenCalledWith(1);
        }
      });

      const setupInitTest = (hasBun = true): void => {
        process.argv = ['bun', 'ronin', 'init', 'test-space'];

        spyOn(fs.promises, 'access').mockImplementation((path) => {
          if (
            path.toString().includes('package.json') ||
            (hasBun && path.toString().includes('bun.lockb')) ||
            path.toString().includes('.gitignore') ||
            path.toString().includes('tsconfig.json')
          ) {
            return Promise.resolve();
          }
          return Promise.reject(new Error('File not found'));
        });

        // Mock file operations.
        // @ts-expect-error This is a mock.
        spyOn(fs.promises, 'readFile').mockImplementation((path) => {
          if (path.toString().includes('.gitignore'))
            return Promise.resolve('node_modules\n');
          if (path.toString().includes('tsconfig.json'))
            return Promise.resolve('{"compilerOptions":{"types":[]}}');
          return Promise.resolve('{"token": "Bulgur"}');
        });
        spyOn(fs.promises, 'appendFile').mockResolvedValue();
        spyOn(fs.promises, 'writeFile').mockResolvedValue();

        spyOn(initModule, 'exec').mockImplementation(
          // @ts-expect-error This is a mock.
          () => () => Promise.resolve({ stdout: '', stderr: '' }),
        );
      };

      test('should successfully initialize a project when no models exist', async () => {
        spyOn(modelModule, 'getModels').mockResolvedValue([]);

        setupInitTest(true);
        await run({ version: '1.0.0' });

        // Verify that writeFile was called for schema/index.ts.
        expect(fs.promises.writeFile).toHaveBeenCalledWith(
          expect.stringContaining('schema/index.ts'),
          expect.stringContaining(
            '// This file is the starting point to define your models in code.',
          ),
        );
      });

      test('should fail to initialize a project with unauthorized access', async () => {
        process.argv = ['bun', 'ronin', 'init', 'test-space'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        // Skip types generation.
        // @ts-expect-error This is a mock.
        spyOn(typesModule, 'default').mockImplementation(() => {});

        setupInitTest();

        spyOn(modelModule, 'getModels').mockImplementation(() => {
          throw new Error('401 Unauthorized');
        });

        spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });

        try {
          await run({ version: '1.0.0' });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('process.exit called');
          expect(exitSpy).toHaveBeenCalledWith(1);
        }

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('You are not a member of the "test-space" space'),
          ),
        ).toBe(true);
      });

      test('should fail to initialize a project - no token provided', async () => {
        process.argv = ['bun', 'ronin', 'init', 'test-space'];
        process.stdout.isTTY = true;

        spyOn(sessionModule, 'getSession').mockResolvedValue(null);
        // @ts-expect-error This is a mock.
        spyOn(loginModule, 'default').mockImplementation(() => Promise.resolve());

        spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });

        setupInitTest();

        spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });

        try {
          await run({ version: '1.0.0' });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('process.exit called');
          expect(exitSpy).toHaveBeenCalledWith(1);
        }

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes(
                'Run `ronin login` to authenticate with RONIN or provide an app token',
              ),
          ),
        ).toBe(true);
      });

      test('diff and apply', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--apply'];

        // Mock space selection and models
        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: [{ type: 'string', slug: 'name' }],
          },
        ]);
        spyOn(miscModule, 'getModelDefinitions').mockResolvedValue([
          {
            slug: 'user',
            fields: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        ]);

        // Mock file operations
        spyOn(fs, 'existsSync').mockImplementation(
          (path) => !path.toString().includes('.ronin/db.sqlite'),
        );
        spyOn(path, 'resolve').mockReturnValue(
          path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
        );

        // Mock fetch
        spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Comparing models'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully generated migration protocol file'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully applied migration'),
          ),
        ).toBe(true);
      });
    });
  });

  describe('migration', () => {
    // Common migration test setup
    // biome-ignore lint/nursery/useExplicitType: This is a mock.
    const setupMigrationTest = (options?: {
      modelDiff?: Array<ModelWithFieldsArray>;
      modelDefinitions?: Array<Model>;
    }) => {
      spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
      spyOn(modelModule, 'getModels').mockResolvedValue(
        options?.modelDiff ?? [
          {
            slug: 'user',
            fields: convertObjectToArray({
              // @ts-expect-error This is a mock.
              name: { type: 'string' },
            }),
          },
        ],
      );
      spyOn(miscModule, 'getModelDefinitions').mockResolvedValue(
        options?.modelDefinitions ?? [
          {
            slug: 'user',
            fields: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        ],
      );
      spyOn(fs, 'existsSync').mockImplementation(
        (path) => !path.toString().includes('.ronin/db.sqlite'),
      );
      spyOn(path, 'resolve').mockReturnValue(
        path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
      );
    };

    describe('diff', () => {
      test('should fail if no schema file is provided', async () => {
        process.argv = ['bun', 'ronin', 'diff'];
        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Could not find a model definition file'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              // Bun's error message format changed between versions - it can use either single
              // or double quotes around module paths in "Cannot find module" errors, so we need
              // to check for both variants to make our tests resilient to Bun version changes.
              (call[0].includes("Cannot find module 'schema/index.ts'") ||
                call[0].includes('Cannot find module "schema/index.ts"')),
          ),
        ).toBe(true);
      });

      test('no changes detected', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--debug'];
        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');

        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: {
              // @ts-expect-error This is a mock.
              name: { type: 'string' },
            },
          },
        ]);
        spyOn(miscModule, 'getModelDefinitions').mockResolvedValue([
          {
            slug: 'user',
            fields: {
              name: { type: 'string' },
            },
          },
        ]);
        spyOn(fs, 'existsSync').mockReturnValue(false);

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Comparing models'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' && call[0].includes('No changes detected'),
          ),
        ).toBe(true);
      });

      test('changes detected', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--sql'];
        setupMigrationTest();

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Comparing models'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully generated migration protocol file'),
          ),
        ).toBe(true);
      });

      test('diff with apply flag', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--apply'];
        setupMigrationTest();

        // Mock fetch
        spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Comparing models'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully generated migration protocol file'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully applied migration'),
          ),
        ).toBe(true);
      });

      test('diff with local flag', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--local'];
        setupMigrationTest();

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Comparing models'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully generated migration protocol file'),
          ),
        ).toBe(true);
      });

      test('diff with multiple flags', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--local', '--apply'];
        setupMigrationTest();

        spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response);

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Comparing models'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully generated migration protocol file'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully applied migration'),
          ),
        ).toBe(true);
      });

      test('force-create flag', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--force-create'];
        setupMigrationTest();

        await run({ version: '1.0.0' });

        expect(writeFileSyncSpy.mock.calls[0][1]).toContain(
          `create.model({ slug: \"user\", fields: { name: { type: \"string\" }, age: { type: \"number\" } } })`,
        );
      });

      test('force-create flag with apply flag', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--force-create', '--apply'];
        setupMigrationTest();

        try {
          await run({ version: '1.0.0' });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain(
            'Cannot run `--apply` and `--force-create` at the same time',
          );
        }
      });

      test('force-drop flag', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--force-drop'];
        setupMigrationTest();

        await run({ version: '1.0.0' });

        expect(writeFileSyncSpy.mock.calls[0][1]).toContain(
          `import { drop } from \"ronin\";\n\nexport default () => [\n  drop.model(\"user\"),\n];\n`,
        );
      });

      test('force-drop flag with force-create flag', async () => {
        process.argv = ['bun', 'ronin', 'diff', '--force-drop', '--force-create'];
        setupMigrationTest();

        try {
          await run({ version: '1.0.0' });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain(
            'Cannot run `--force-drop` and `--force-create` at the same time',
          );
        }
      });

      test('diff with same diff as latest migration and cancel', async () => {
        process.argv = ['bun', 'ronin', 'diff'];
        setupMigrationTest({
          modelDiff: [],
          modelDefinitions: [
            {
              slug: 'user',
              fields: { name: { type: 'string' } },
            },
          ],
        });

        // @ts-expect-error This is a mock.
        spyOn(fs, 'readdirSync').mockReturnValue(['migration-fixture.ts']);
        spyOn(path, 'join').mockReturnValue(
          path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
        );
        spyOn(confirmModule, 'confirm').mockResolvedValue(false);

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Migration creation cancelled'),
          ),
        ).toBe(true);
      });

      test('diff with same diff as latest migration and create', async () => {
        process.argv = ['bun', 'ronin', 'diff'];
        setupMigrationTest({
          modelDiff: [],
          modelDefinitions: [
            {
              slug: 'user',
              fields: { name: { type: 'string' } },
            },
          ],
        });

        // @ts-expect-error This is a mock.
        spyOn(fs, 'readdirSync').mockReturnValue(['migration-fixture.ts']);
        spyOn(path, 'join').mockReturnValueOnce(
          path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
        );
        spyOn(confirmModule, 'confirm').mockResolvedValue(true);
        spyOn(Math, 'max').mockReturnValue(1);

        await run({ version: '1.0.0' });
        expect(writeFileSyncSpy.mock.calls[0][0]).toContain('migration-0002.ts');
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully generated migration protocol file'),
          ),
        ).toBe(true);
      });
    });

    describe('apply', () => {
      test('invalid token', async () => {
        process.argv = ['bun', 'ronin', 'apply'];
        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Failed to apply migration'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Invalid `Authorization` header: Must be a valid JWT'),
          ),
        ).toBe(true);
      });

      test('apply migration', async () => {
        process.argv = ['bun', 'ronin', 'apply'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: convertObjectToArray({
              fields: {
                name: { type: 'string' },
              },
            }),
          },
        ]);

        spyOn(fs, 'existsSync').mockImplementation(
          (path) =>
            path.toString().includes('migration-fixture.ts') ||
            path.toString().includes('.ronin/migrations'),
        );
        spyOn(selectModule, 'select').mockResolvedValue('migration-0001.ts');
        spyOn(path, 'resolve').mockReturnValue(
          path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
        );

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Failed to apply migration'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Authorization` header: Must be a valid JWT'),
          ),
        ).toBe(true);
      });

      test('apply migration without migrations directory', async () => {
        process.argv = ['bun', 'ronin', 'apply'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: convertObjectToArray({
              fields: {
                name: { type: 'string' },
              },
            }),
          },
        ]);

        spyOn(fs, 'existsSync').mockImplementation((path) =>
          path.toString().includes('migration-fixture.ts'),
        );

        try {
          await run({ version: '1.0.0' });
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain(
            'Migrations directory not found. Run `ronin diff` to create your first migration.',
          );
        }
      });

      test('should handle network errors when applying migration', async () => {
        process.argv = ['bun', 'ronin', 'apply'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(global, 'fetch').mockImplementation(() => {
          throw new Error('Network error');
        });

        await run({ version: '1.0.0' });

        expect(
          // @ts-expect-error This is a mock.
          stderrSpy.mock.calls.some((call) => call[0].includes('Network error')),
        ).toBe(true);
      });

      test('apply with local flag', async () => {
        process.argv = ['bun', 'ronin', 'apply', '--local'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: convertObjectToArray({
              fields: {
                name: { type: 'string' },
              },
            }),
          },
        ]);

        spyOn(fs, 'existsSync').mockImplementation(
          (path) =>
            path.toString().includes('migration-fixture.ts') ||
            path.toString().includes('.ronin/migrations'),
        );
        spyOn(selectModule, 'select').mockResolvedValue('migration-0001.ts');
        spyOn(path, 'resolve').mockReturnValue(
          path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
        );

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Applying migration to local database'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Successfully applied migration'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) => typeof call[0] === 'string' && call[0].includes('Generating types'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' && call[0].includes('Failed to generate types'),
          ),
        ).toBe(true);
      });

      test('skip generating types', async () => {
        process.argv = ['bun', 'ronin', 'apply', '--local', '--skip-types'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: convertObjectToArray({
              fields: {
                name: { type: 'string' },
              },
            }),
          },
        ]);

        spyOn(fs, 'existsSync').mockImplementation(
          (path) =>
            path.toString().includes('migration-fixture.ts') ||
            path.toString().includes('.ronin/migrations'),
        );
        spyOn(selectModule, 'select').mockResolvedValue('migration-0001.ts');
        spyOn(path, 'resolve').mockReturnValue(
          path.join(process.cwd(), 'tests/fixtures/migration-fixture.ts'),
        );

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            ([call]) =>
              typeof call === 'string' &&
              call.includes('Applying migration to local database'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            ([call]) =>
              typeof call === 'string' && call.includes('Successfully applied migration'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            ([call]) => typeof call === 'string' && call.includes('Generating types'),
          ),
        ).toBe(false);
        expect(
          stderrSpy.mock.calls.some(
            ([call]) =>
              typeof call === 'string' && call.includes('Failed to generate types'),
          ),
        ).toBe(false);
      });

      test('try to apply with non-existent migration file', async () => {
        process.argv = ['bun', 'ronin', 'apply'];

        spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
        spyOn(fs, 'existsSync').mockReturnValue(false);

        spyOn(fs, 'readdirSync').mockReturnValue([]);
        spyOn(modelModule, 'getModels').mockResolvedValue([
          {
            slug: 'user',
            fields: [{ type: 'string', slug: 'name' }],
          },
        ]);

        spyOn(fs, 'existsSync').mockImplementation((path) =>
          path.toString().includes('.ronin/migrations'),
        );

        await run({ version: '1.0.0' });

        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes('Failed to apply migration'),
          ),
        ).toBe(true);
        expect(
          stderrSpy.mock.calls.some(
            (call) =>
              typeof call[0] === 'string' &&
              call[0].includes(
                'No migrations found. Run `ronin diff` to create your first migration.',
              ),
          ),
        ).toBe(true);
      });
    });
  });

  describe('types', () => {
    test('should throw with an invalid token', async () => {
      process.argv = ['bun', 'ronin', 'types'];
      spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');

      await run({ version: '1.0.0' });

      expect(
        stderrSpy.mock.calls.some(
          (call) =>
            typeof call[0] === 'string' && call[0].includes('Failed to generate types'),
        ),
      ).toBe(true);
    });

    test('should handle network errors when generating types', async () => {
      process.argv = ['bun', 'ronin', 'types'];

      spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
      spyOn(global, 'fetch').mockImplementation(() => {
        throw new Error('Network error');
      });

      await run({ version: '1.0.0' });

      expect(
        // @ts-expect-error This is a mock.
        stderrSpy.mock.calls.some((call) => call[0].includes('Network error')),
      ).toBe(true);
    });

    test('should handle network errors when generating zod schemas', async () => {
      process.argv = ['bun', 'ronin', 'types', '--zod'];

      spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');
      spyOn(global, 'fetch').mockImplementation(() => {
        throw new Error('Network error');
      });

      await run({ version: '1.0.0' });

      expect(
        // @ts-expect-error This is a mock.
        stderrSpy.mock.calls.some((call) => call[0].includes('Network error')),
      ).toBe(true);
    });
  });

  describe('pull', () => {
    test('pulled model are up to date', async () => {
      process.argv = ['bun', 'ronin', 'pull'];

      spyOn(spaceModule, 'getOrSelectSpaceId').mockResolvedValue('test-space');

      await run({ version: '1.0.0' });

      expect(
        stderrSpy.mock.calls.some(
          (call) =>
            typeof call[0] === 'string' && call[0].includes('Failed to pull models'),
        ),
      ).toBe(true);
    });
  });
});
