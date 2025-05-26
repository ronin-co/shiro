import { Database } from 'bun:sqlite';
import { ROOT_MODEL, Transaction } from 'shiro-compiler';

import createSyntaxFactory from '@/src/index';

import type { Model, Query } from 'shiro-compiler';

interface ShiroOptions<T extends Array<unknown>> {
  /**
   * @todo Add documentation
   */
  database?: Database;

  /**
   * @todo Add documentation
   */
  experimental?: {
    /**
     * @todo Add documentation
     */
    initializeModels?: boolean;
  };

  /**
   * @todo Add documentation
   */
  models: T;
}

/**
 * @todo Add documentation
 */
export const shiro = <const T extends Array<unknown>>(options: ShiroOptions<T>) => {
  const database = options.database ?? new Database(':memory:');

  if (options.experimental?.initializeModels === true) {
    const models = Object.values(options.models);

    const queries = new Array<Query>({ create: { model: ROOT_MODEL } });
    for (const model of models) {
      queries.push({
        create: {
          model: model as unknown as Model,
        },
      });
    }

    const transaction = new Transaction(queries);
    for (const { params, statement } of transaction.statements) {
      database.query(statement).all(...(params as Array<string>));
    }
  }

  return createSyntaxFactory({
    fetch: async (request) => {
      if (!(request instanceof Request))
        throw new Error('Fetcher can only handle Request objects');

      const { nativeQueries } = (await request.json()) as {
        nativeQueries: Array<{ query: string; values: Array<string> }>;
      };

      return Response.json({
        results: nativeQueries.map(({ query, values }) =>
          database.query(query).all(...values),
        ),
      });
    },
    token: crypto.randomUUID(),
    models: options.models as Array<Model>,
  });
};
