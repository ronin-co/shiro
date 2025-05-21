import { describe, expect, mock, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import {
  Account,
  Account3,
  AccountNew,
  AccountWithBoolean,
  AccountWithRequiredBoolean,
  AccountWithRequiredDefault,
  AccountWithoutUnique,
  Profile,
  TestA,
  TestB,
  TestC,
  TestD,
  TestE,
  TestF,
  TestG,
  TestH,
  TestI,
  TestJ,
  TestK,
  TestL,
  TestM,
  TestN,
  TestO,
  TestP,
  TestQ,
  TestR,
  TestT,
  TestU,
} from '@/fixtures/index';
import { getRowCount, getSQLTables, getTableRows, runMigration } from '@/fixtures/utils';
import { applyMigrationStatements } from '@/src/commands/apply';
import type { MigrationFlags } from '@/src/utils/migration';
import { getLocalPackages } from '@/src/utils/misc';
import type { Database } from '@ronin/engine/resources';
import type { Model } from 'shiro-compiler';
import { model, number, random, string } from 'shiro-orm/schema';
const packages = await getLocalPackages();
const { Transaction } = packages.compiler;

describe('applyMigrationStatements', () => {
  test('should apply migration to local database', async () => {
    const mockDb = {
      query: mock(() => Promise.resolve()),
      getContents: mock(() => Promise.resolve(Buffer.from('mock-db-contents'))),
    };
    const mockStatements = [
      { statement: 'CREATE TABLE test (id INTEGER PRIMARY KEY)' },
      { statement: 'INSERT INTO test VALUES (1)' },
    ];
    const mockFlags = { local: true, help: false, version: false, debug: false };
    const mockSlug = 'test-space';

    const writeFileSpy = spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const stdoutSpy = spyOn(process.stderr, 'write');

    await applyMigrationStatements(
      'mock-token',
      mockFlags,
      mockDb as unknown as Database,
      mockStatements,
      mockSlug,
    );

    expect(mockDb.query).toHaveBeenCalledWith(
      mockStatements.map(({ statement }) => statement),
    );
    expect(mockDb.getContents).toHaveBeenCalled();
    expect(writeFileSpy).toHaveBeenCalledWith(
      '.ronin/db.sqlite',
      await mockDb.getContents(),
    );

    expect(
      stdoutSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('Applying migration to local database'),
      ),
    ).toBe(true);

    writeFileSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  test('should apply migration to production database', async () => {
    const mockDb = {
      query: mock(() => Promise.resolve()),
      getContents: mock(() => Promise.resolve(Buffer.from('mock-db-contents'))),
    };
    const mockStatements = [
      { statement: 'CREATE TABLE test (id INTEGER PRIMARY KEY)' },
      { statement: 'INSERT INTO test VALUES (1)' },
    ];
    const mockFlags = { local: false, help: false, version: false, debug: false };
    const mockSlug = 'test-space';
    const mockToken = 'mock-token';

    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );

    const stdoutSpy = spyOn(process.stderr, 'write');

    await applyMigrationStatements(
      mockToken,
      mockFlags,
      mockDb as unknown as Database,
      mockStatements,
      mockSlug,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      `https://data.ronin.co/?data-selector=${mockSlug}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockToken}`,
        },
        body: JSON.stringify({
          nativeQueries: mockStatements.map((query) => ({
            query: query.statement,
            mode: 'write',
          })),
        }),
      },
    );
    expect(
      stdoutSpy.mock.calls.some(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('Applying migration to production database'),
      ),
    ).toBe(true);

    stdoutSpy.mockRestore();
  });

  test('should throw error when production API returns error', async () => {
    const mockDb = {
      query: mock(() => Promise.resolve()),
      getContents: mock(() => Promise.resolve(Buffer.from('mock-db-contents'))),
    };
    const mockStatements = [{ statement: 'CREATE TABLE test (id INTEGER PRIMARY KEY)' }];
    const mockFlags: MigrationFlags = {
      local: false,
      help: false,
      version: false,
      debug: false,
    };
    const mockSlug = 'test-space';
    const mockToken = 'mock-token';
    const errorMessage = 'Database error occurred';

    global.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: { message: errorMessage } }),
      } as Response),
    );

    await expect(
      applyMigrationStatements(
        mockToken,
        mockFlags,
        mockDb as unknown as Database,
        mockStatements,
        mockSlug,
      ),
    ).rejects.toThrow(errorMessage);
  });

  test('should handle network failures when applying to production', async () => {
    const mockDb = {
      query: mock(() => Promise.resolve()),
      getContents: mock(() => Promise.resolve(Buffer.from('mock-db-contents'))),
    };
    const mockStatements = [{ statement: 'CREATE TABLE test (id INTEGER PRIMARY KEY)' }];
    const mockFlags = { local: false, help: false, version: false, debug: false };
    const mockSlug = 'test-space';
    const mockToken = 'mock-token';

    global.fetch = mock(() => Promise.reject(new Error('Network error')));

    await expect(
      applyMigrationStatements(
        mockToken,
        mockFlags,
        mockDb as unknown as Database,
        mockStatements,
        mockSlug,
      ),
    ).rejects.toThrow('Network error');
  });
});

describe('apply', () => {
  describe('model', () => {
    describe('without records', () => {
      describe('create', () => {
        test('simple', async () => {
          const { models, statements, db, modelDiff } = await runMigration([TestA], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(modelDiff).toHaveLength(1);
          expect(statements).toHaveLength(3);
          expect(models).toHaveLength(1);
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(models[0].slug).toBe('test');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('with index', async () => {
          const { models, statements, db, modelDiff } = await runMigration([TestB], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(modelDiff).toHaveLength(1);
          expect(statements).toHaveLength(3);
          expect(models).toHaveLength(1);
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(models[0].slug).toBe('test');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('with relationships', async () => {
          const { models, statements, db } = await runMigration([Account, Profile], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(statements.length).toEqual(4);
          expect(models).toHaveLength(2);
          expect(models[0].name).toBe('Account');
          expect(models[0].pluralName).toBe('Accounts');
          expect(models[1].name).toBe('Profile');
          expect(models[1].pluralName).toBe('Profiles');
          expect(rowCounts).toEqual({
            accounts: 0,
            profiles: 0,
          });
        });

        test('with one-to-many relationship', async () => {
          const { models, db } = await runMigration([TestP, TestQ], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          const res = await getSQLTables(db);

          expect(res).toHaveLength(4);
          expect(models).toHaveLength(2);
          expect(rowCounts).toEqual({
            manies: 0,
            tests: 0,
          });
        });

        test('nested fields', async () => {
          const NestedFields = model({
            slug: 'nested',
            fields: {
              name: string(),
              'address.city': string(),
              'address.state': string(),
              'address.zip': string(),
            },
          }) as unknown as Model;

          const { models, statements, db } = await runMigration([NestedFields], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models[0].fields).toEqual({
            name: {
              name: 'Name',
              type: 'string',
            },
            'address.city': {
              name: 'Address.city',
              type: 'string',
            },
            'address.state': {
              name: 'Address.state',
              type: 'string',
            },
            'address.zip': {
              name: 'Address.zip',
              type: 'string',
            },
          });
          expect(statements).toHaveLength(2);
          expect(models).toHaveLength(1);
          expect(models[0].name).toBe('Nested');
          expect(models[0].pluralName).toBe('Nesteds');
        });
      });

      describe('drop', () => {
        test('simple', async () => {
          const { models, statements, db } = await runMigration([], [TestA]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(statements).toHaveLength(2);
          expect(models).toHaveLength(0);
          expect(rowCounts).toEqual({});
        });

        test('multiple with dependencies', async () => {
          const { models, db } = await runMigration([], [Account, Profile, TestA]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(0);
          expect(rowCounts).toEqual({});
        });

        test('with index', async () => {
          const { models, statements, db } = await runMigration([], [TestB]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(statements).toHaveLength(2);
          expect(models).toHaveLength(0);
          expect(rowCounts).toEqual({});
        });
      });

      describe('update', () => {
        test('fields', async () => {
          const { models, statements, db } = await runMigration([TestF], [TestA]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(statements).toHaveLength(7);
          expect(models).toHaveLength(1);
          expect(models[0].slug).toBe('test');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('meta properties', async () => {
          const { models, db } = await runMigration([TestC], [TestA]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(models).toHaveLength(1);
          expect(models[0].name).toBe('Test');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('no changes between model sets', async () => {
          const allModels = [TestG, Account, AccountNew, Profile];
          const { models, db } = await runMigration(allModels, allModels);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models.length).toBe(allModels.length);
          expect(rowCounts).toEqual({
            tests: 0,
            accounts: 0,
            accounts_new: 0,
            profiles: 0,
          });
        });

        test('meta properties and fields', async () => {
          const definedModel = model({
            slug: 'test',
            name: 'Test',
            pluralName: 'Tests',
            pluralSlug: 'tests',
            idPrefix: 'test',
            fields: {
              name: string({ defaultValue: 'I <3 RONIN' }),
              age: number(),
              email: string(),
            },
          }) as unknown as Model;

          const existingModel = model({
            slug: 'test',
            idPrefix: 'corny',
            fields: {
              name: string(),
              age: number(),
            },
          }) as unknown as Model;

          const { models, db, modelDiff } = await runMigration(
            [definedModel],
            [existingModel],
          );

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(modelDiff).toHaveLength(9);
          expect(Object.keys(models[0]?.fields || {}).length).toBe(3);
          expect(models).toHaveLength(1);
          expect(models[0].name).toBe('Test');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });
      });
    });

    describe('with records', () => {
      describe('create', () => {
        test('simple', async () => {
          const { models, db } = await runMigration([TestA], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(1);
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });
      });

      describe('update', () => {
        test('id prefix', async () => {
          const definedModel = model({
            slug: 'test',
            idPrefix: 'test',
            fields: {
              name: string(),
            },
          }) as unknown as Model;

          const existingModel = model({
            slug: 'test',
            idPrefix: 'corny',
            fields: {
              name: string(),
            },
          }) as unknown as Model;

          const insert = {
            add: {
              test: {
                with: {
                  name: 'Ilayda',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [definedModel, existingModel],
            inlineParams: true,
          });

          const { db, models } = await runMigration(
            [definedModel],
            [existingModel],
            {},
            transaction.statements.map((statement) => statement),
          );

          await db.query(transaction.statements);
          const rows = await getTableRows(db, models[0]);

          expect(models[0].slug).toBe('test');
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(rows[0].id).toContain('corny_');
          expect(rows[1].id).toContain('test_');
        });

        test('id prefix and add fields', async () => {
          const definedModel = model({
            slug: 'test',
            idPrefix: 'test',
            fields: {
              name: string(),
              age: number(),
              email: string(),
            },
          }) as unknown as Model;

          const existingModel = model({
            slug: 'test',
            idPrefix: 'corny',
            fields: {
              name: string(),
            },
          }) as unknown as Model;

          const insert = {
            add: {
              test: {
                with: {
                  name: 'Ilayda',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [definedModel, existingModel],
            inlineParams: true,
          });

          const { db, models, modelDiff } = await runMigration(
            [definedModel],
            [existingModel],
            {},
            transaction.statements.map((statement) => statement),
          );

          await db.query(transaction.statements);
          const rows = await getTableRows(db, models[0]);

          expect(Object.keys(models[0]?.fields || {}).length).toBe(3);
          expect(modelDiff).toHaveLength(6);
          expect(models[0].slug).toBe('test');
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(rows[0].id).toContain('corny_');
          expect(rows[1].id).toContain('test_');
        });

        test('id prefix and drop fields', async () => {
          const definedModel = model({
            slug: 'test',
            idPrefix: 'test',
            fields: {
              name: string(),
            },
          }) as unknown as Model;

          const existingModel = model({
            slug: 'test',
            idPrefix: 'corny',
            fields: {
              name: string(),
              age: number(),
              email: string(),
            },
          }) as unknown as Model;

          const insert = {
            add: {
              test: {
                with: {
                  name: 'Ilayda',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [definedModel, existingModel],
            inlineParams: true,
          });

          const { db, models, modelDiff } = await runMigration(
            [definedModel],
            [existingModel],
            {},
            transaction.statements.map((statement) => statement),
          );

          await db.query(transaction.statements);
          const rows = await getTableRows(db, models[0]);

          expect(Object.keys(models[0]?.fields || {}).length).toBe(1);
          expect(modelDiff).toHaveLength(6);
          expect(models[0].slug).toBe('test');
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(rows[0].id).toContain('corny_');
          expect(rows[1].id).toContain('test_');
        });

        test('id prefix and adjust field', async () => {
          const definedModel = model({
            slug: 'test',
            idPrefix: 'test',
            fields: {
              name: string({ defaultValue: 'I <3 RONIN' }),
            },
          }) as unknown as Model;

          const existingModel = model({
            slug: 'test',
            idPrefix: 'corny',
            fields: {
              name: string(),
            },
          }) as unknown as Model;

          const insert = {
            add: {
              test: {
                with: {
                  name: 'Ilayda',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [definedModel, existingModel],
            inlineParams: true,
          });

          const { db, models, modelDiff } = await runMigration(
            [definedModel],
            [existingModel],
            {},
            transaction.statements.map((statement) => statement),
          );

          await db.query(transaction.statements);
          const rows = await getTableRows(db, models[0]);

          expect(Object.keys(models[0]?.fields || {}).length).toBe(1);
          expect(modelDiff).toHaveLength(8);
          expect(models[0].slug).toBe('test');
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(rows[0].id).toContain('corny_');
          expect(rows[1].id).toContain('test_');
        });

        test('id prefix and drop, add and adjust fields', async () => {
          const definedModel = model({
            slug: 'test',
            idPrefix: 'test',
            fields: {
              name: string({ defaultValue: 'I <3 RONIN' }),
              email: string(),
            },
          }) as unknown as Model;

          const existingModel = model({
            slug: 'test',
            idPrefix: 'corny',
            fields: {
              name: string(),
              age: number(),
            },
          }) as unknown as Model;

          const insert = {
            add: {
              test: {
                with: {
                  name: 'Ilayda',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [definedModel, existingModel],
            inlineParams: true,
          });

          const { db, models, modelDiff } = await runMigration(
            [definedModel],
            [existingModel],
            {},
            transaction.statements.map((statement) => statement),
          );

          await db.query(transaction.statements);
          const rows = await getTableRows(db, models[0]);

          expect(Object.keys(models[0]?.fields || {}).length).toBe(2);
          expect(modelDiff).toHaveLength(10);
          expect(Object.keys(models[0]?.fields || {}).length).toBe(2);
          expect(modelDiff).toHaveLength(10);
          expect(models[0].slug).toBe('test');
          expect(models[0].name).toBe('Test');
          expect(models[0].pluralName).toBe('Tests');
          expect(rows[0].id).toContain('corny_');
          expect(rows[1].id).toContain('test_');
        });
      });
    });
  });

  describe('field', () => {
    describe('without records', () => {
      describe('create', () => {
        test('add field and change property', async () => {
          const { models, db } = await runMigration([TestG], [TestF]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(1);
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('add unique field', async () => {
          const { models, db } = await runMigration([TestG], [TestN], {
            requiredDefault: 'RONIN_TEST_VALUE',
          });

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(models).toHaveLength(1);
          expect(models[0]?.fields?.age?.unique).toBe(true);
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('add field with expression as default value', async () => {
          const ModelA = model({
            slug: 'a',
            fields: {
              name: string(),
            },
          }) as unknown as Model;

          const ModelB = model({
            slug: 'a',
            fields: {
              name: string(),
              age: number().defaultValue(() => random()),
            },
          }) as unknown as Model;

          const { models, db, modelDiff } = await runMigration([ModelB], [ModelA], {
            requiredDefault: 'RONIN_TEST_VALUE',
          });

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(modelDiff[0]).toContain(
            'create.model({"slug":"RONIN_TEMP_a","fields":{"name":{"type":"string"},"age":{"type":"number","defaultValue":{"__RONIN_EXPRESSION":"random()"}}}})',
          );

          expect(modelDiff[1]).toContain(
            'add.RONIN_TEMP_a.with(() => get.a({"selecting":["name"]}))',
          );

          expect(modelDiff[2]).toContain('drop.model("a")');

          expect(modelDiff[3]).toContain(
            'alter.model("RONIN_TEMP_a").to({slug: "a", name: "A", pluralName: "As"})',
          );

          expect(models).toHaveLength(1);
          expect(models[0]?.fields?.age?.defaultValue).toEqual({
            __RONIN_EXPRESSION: 'random()',
          });
          expect(rowCounts).toEqual({
            as: 0,
          });
        });
      });

      describe('drop', () => {
        test('remove unique field', async () => {
          const { models, db } = await runMigration([TestN], [TestG]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(1);
          expect(models[0]?.fields?.name?.type).toBe('string');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('remove field and add new fields', async () => {
          const { models, modelDiff, db } = await runMigration([TestP], [TestO]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(modelDiff).toHaveLength(4);
          expect(models).toHaveLength(1);
          expect(models[0]?.fields?.name?.type).toBe('string');
          expect(models[0]?.fields?.age?.type).toBe('string');
          expect(models[0]?.fields?.description?.unique).toBe(true);
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });
      });

      describe('update', () => {
        test('type', async () => {
          const { models, db } = await runMigration([TestM], [TestL]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(1);
          expect(models[0]?.fields?.test?.type).toBe('json');
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('rename', async () => {
          const { models, db } = await runMigration([TestI], [TestH], {
            rename: true,
            requiredDefault: 'RONIN_TEST_VALUE',
          });

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(1);
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });

        test('update field with expression as default value', async () => {
          const ModelA = model({
            slug: 'a',
            fields: {
              name: string(),
              age: number().defaultValue(() => 25),
            },
          }) as unknown as Model;

          const ModelB = model({
            slug: 'a',
            fields: {
              name: string(),
              age: number().defaultValue(() => random()),
            },
          }) as unknown as Model;

          const { models, db, modelDiff } = await runMigration([ModelB], [ModelA], {
            requiredDefault: 'RONIN_TEST_VALUE',
          });

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(modelDiff).toEqual([
            'alter.model(\'a\').create.field({"slug":"RONIN_TEMP_age","type":"number","defaultValue":{"__RONIN_EXPRESSION":"random()"}})',
            'set.a.to.RONIN_TEMP_age(f => f.age)',
            'alter.model("a").drop.field("age")',
            'alter.model("a").alter.field("RONIN_TEMP_age").to({slug: "age"})',
          ]);

          expect(models).toHaveLength(1);
          expect(models[0]?.fields?.age?.defaultValue).toEqual({
            __RONIN_EXPRESSION: 'random()',
          });
          expect(rowCounts).toEqual({
            as: 0,
          });
        });
      });
    });

    describe('with records', () => {
      describe('create', () => {
        test('required field & unqiue', async () => {
          const insert = {
            add: {
              account: {
                with: {
                  name: 'Jacqueline',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [Account, Account3],
            inlineParams: true,
          });

          const { models, db } = await runMigration(
            [Account3],
            [Account],
            { rename: false, requiredDefault: 'RONIN_TEST_VALUE' },
            transaction.statements.map((statement) => statement),
          );

          const rows = await getTableRows(db, Account3);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(rowCounts).toEqual({
            accounts: 1,
          });

          expect(rows[0].email).toBe('RONIN_TEST_VALUE');
        });

        test('required field', async () => {
          const insert = {
            add: {
              account: {
                with: {
                  name: 'Jacqueline',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [Account, AccountWithoutUnique],
            inlineParams: true,
          });

          const { models, db } = await runMigration(
            [AccountWithoutUnique],
            [Account],
            { rename: false, requiredDefault: 'RONIN_TEST_VALUE' },
            transaction.statements.map((statement) => statement),
          );

          const rows = await getTableRows(db, Account3);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(rowCounts).toEqual({
            accounts: 1,
          });

          expect(rows[0].email).toBe('RONIN_TEST_VALUE');
        });

        test('required field with default value', async () => {
          const insert = {
            add: {
              account: {
                with: {
                  name: 'Jacqueline',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [Account, AccountWithRequiredDefault],
            inlineParams: true,
          });

          const { models, db, modelDiff } = await runMigration(
            [AccountWithRequiredDefault],
            [Account],
            { rename: false, requiredDefault: 'RONIN_TEST_VALUE' },
            transaction.statements.map((statement) => statement),
          );

          await db.query(transaction.statements);

          const rows = await getTableRows(db, AccountWithRequiredDefault);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(modelDiff).toHaveLength(1);
          expect(rowCounts).toEqual({
            accounts: 2,
          });

          expect(rows[0].email).toBe('RONIN_TEST_VALUE_REQUIRED_DEFAULT');
        });

        test('required field with number', async () => {
          const insert = {
            add: {
              account: {
                with: {
                  name: 'Jacqueline',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [AccountWithBoolean, AccountWithRequiredBoolean],
            inlineParams: true,
          });

          const { models, db } = await runMigration(
            [AccountWithRequiredBoolean],
            [AccountWithBoolean],
            { rename: false, requiredDefault: true },
            transaction.statements.map((statement) => statement),
          );

          const rows = await getTableRows(db, Account3);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(rowCounts).toEqual({
            accounts: 1,
          });

          expect(rows[0].email).toBe(1);
        });
      });

      describe('update', () => {
        test('required field', async () => {
          const insert = {
            add: {
              test: {
                with: {
                  test: 'test',
                },
              },
            },
          };

          const transaction = new Transaction([insert], {
            models: [TestL, TestU],
            inlineParams: true,
          });

          const { models, db } = await runMigration(
            [TestU],
            [TestL],
            { rename: false, requiredDefault: 'RONIN_TEST_VALUE' },
            transaction.statements.map((statement) => statement),
          );

          const rows = await getTableRows(db, TestU);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(rowCounts).toEqual({
            tests: 1,
          });

          expect(rows[0].name).toBe('RONIN_TEST_VALUE');
        });
      });
    });
  });

  describe('relationship', () => {
    describe('without records', () => {
      describe('create', () => {
        test('with link cascade', async () => {
          const { models, db } = await runMigration([TestE, TestK], [TestE, TestJ]);
          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }

          expect(models).toHaveLength(2);
          if (
            models[1].fields?.test.type === 'link' &&
            'actions' in models[1].fields.test
          ) {
            expect(models[1]?.fields?.test?.actions?.onDelete).toBe('CASCADE');
          }
          expect(rowCounts).toEqual({
            comments: 0,
            tests: 0,
          });
        });

        test('one-to-many', async () => {
          const { models, db } = await runMigration([TestP, TestR], [TestP, TestQ]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          const res = await getSQLTables(db);

          expect(res).toHaveLength(4);
          expect(models).toHaveLength(2);
          expect(rowCounts).toEqual({
            tests: 0,
            manies: 0,
          });
        });
      });

      describe('drop', () => {
        test('many-to-many', async () => {
          const { models, db } = await runMigration([TestP, TestT], [TestP, TestQ]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          const res = await getSQLTables(db);

          expect(res).toHaveLength(3);
          expect(models).toHaveLength(2);
          expect(rowCounts).toEqual({
            manies: 0,
            tests: 0,
          });
        });
      });

      describe('update', () => {
        test('model name', async () => {
          const { models, statements, db } = await runMigration([Account], [AccountNew], {
            rename: true,
            requiredDefault: 'RONIN_TEST_VALUE',
          });

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(statements).toHaveLength(2);
          expect(models).toHaveLength(1);
          expect(models[0].slug).toBe('account');
          expect(rowCounts).toEqual({
            accounts: 0,
          });
        });

        test('with existing relationships', async () => {
          const { models, db } = await runMigration(
            [AccountNew, Profile],
            [Account, Profile],
            { rename: true, requiredDefault: 'RONIN_TEST_VALUE' },
          );

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models.find((m) => m.slug === 'account_new')).toBeDefined();
          expect(rowCounts).toEqual({
            account_news: 0,
            profiles: 0,
          });
        });
      });
    });
  });

  describe('index', () => {
    describe('without records', () => {
      describe('create', () => {
        test('simple', async () => {
          const { models, db } = await runMigration([TestB], []);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(1);
          expect(rowCounts).toEqual({
            tests: 0,
          });
        });
      });

      describe('drop', () => {
        test('simple', async () => {
          const { models, db } = await runMigration([], [TestA]);

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(0);
        });
      });
    });
  });

  describe('complex', () => {
    describe('without records', () => {
      describe('update', () => {
        test('multiple changes', async () => {
          const { models, db } = await runMigration(
            [TestE, TestB, Account],
            [TestD, TestA, AccountNew],
            { rename: true, requiredDefault: 'RONIN_TEST_VALUE' },
          );

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models).toHaveLength(3);
          expect(rowCounts).toEqual({
            tests: 0,
            comments: 0,
            accounts: 0,
          });
        });

        test('mixed operations', async () => {
          const { models, db } = await runMigration(
            [TestB, TestE, Account],
            [TestA, TestD],
            { rename: true, requiredDefault: 'RONIN_TEST_VALUE' },
          );

          const rowCounts: Record<string, number> = {};
          for (const model of models) {
            if (model.pluralSlug) {
              rowCounts[model.pluralSlug] = await getRowCount(db, model.pluralSlug);
            }
          }
          expect(models.length).toBeGreaterThan(1);
          expect(rowCounts).toEqual({
            tests: 0,
            comments: 0,
            accounts: 0,
          });
        });
      });
    });
  });
});
