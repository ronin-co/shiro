import { Database } from 'bun:sqlite';
import { ROOT_MODEL, Transaction } from 'shiro-compiler';

import type { Model, Query } from 'shiro-compiler';
import type { InferredModel } from 'shiro-syntax/schema';

import createSyntaxFactory from '@/src/index';
import type {
  InferAddSyntaxProxy,
  InferCountSyntaxProxy,
  InferGetSyntaxProxy,
  InferListSyntaxProxy,
  InferRemoveSyntaxProxy,
  InferSetSyntaxProxy,
  SharedAdapterOptions,
} from '@/src/types/adapter';

interface ShiroOptions<T extends Record<string, InferredModel> | Array<InferredModel>>
  extends SharedAdapterOptions<T> {
  /**
   * @todo Add documentation
   */
  database?: Database;
}

/**
 * @todo Add documentation
 */
export const shiro = <
  const T extends Record<string, InferredModel> | Array<InferredModel>,
>(
  options: ShiroOptions<T>,
) => {
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

  const factory = createSyntaxFactory({
    fetch: async (request) => {
      // TODO(@nurodev): Improve error handling.
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
    models: options.models as unknown as Array<Model>,
    token: '1',
  });

  return {
    add: factory.add as InferAddSyntaxProxy<T>,
    count: factory.count as InferCountSyntaxProxy<T>,
    get: factory.get as unknown as InferGetSyntaxProxy<T>,
    remove: factory.remove as unknown as InferRemoveSyntaxProxy<T>,
    set: factory.set as unknown as InferSetSyntaxProxy<T>,

    alter: factory.alter,
    create: factory.create,
    drop: factory.drop,
    list: factory.list as unknown as InferListSyntaxProxy,

    batch: factory.batch,
    sql: factory.sql,
    sqlBatch: factory.sqlBatch,
  };
};
