import { Database } from 'bun:sqlite';
import { QUERY_SYMBOLS, ROOT_MODEL, Transaction } from 'shiro-compiler';
import { getSyntaxProxy } from 'shiro-syntax/queries';

import { isStorableObject } from '@/src/storage';
import { queryHandler } from '@/src/utils/handlers';

import type { Model, Query } from 'shiro-compiler';
import type { InferredModel } from 'shiro-syntax/schema';

import type {
  InferAddSyntaxProxy,
  InferCountSyntaxProxy,
  InferGetSyntaxProxy,
  InferListSyntaxProxy,
  InferRemoveSyntaxProxy,
  InferSetSyntaxProxy,
  SharedAdapterOptions,
} from '@/src/types/adapter';

interface ShiroOptions<T extends Array<InferredModel>> extends SharedAdapterOptions<T> {
  /**
   * @todo Add documentation
   */
  database?: Database;
}

/**
 * @todo Add documentation
 */
export const shiro = <const T extends Array<InferredModel>>(options: ShiroOptions<T>) => {
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

  const callback = (defaultQuery: Query) => {
    const query = defaultQuery as Record<typeof QUERY_SYMBOLS.QUERY, Query>;
    return queryHandler(query[QUERY_SYMBOLS.QUERY], {
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
      token: crypto.randomUUID(),
    });
  };

  // Ensure that storable objects are retained as-is instead of being serialized.
  const replacer = (value: unknown) => (isStorableObject(value) ? value : undefined);

  return {
    //------------------------------------
    // DML Queries
    //------------------------------------
    add: getSyntaxProxy({
      root: `${QUERY_SYMBOLS.QUERY}.add`,
      callback,
      replacer,
    }) as InferAddSyntaxProxy<T>,
    count: getSyntaxProxy({
      root: `${QUERY_SYMBOLS.QUERY}.count`,
      callback,
      replacer,
    }) as InferCountSyntaxProxy<T>,
    get: getSyntaxProxy({
      root: `${QUERY_SYMBOLS.QUERY}.get`,
      callback,
      replacer,
    }) as InferGetSyntaxProxy<T>,
    remove: getSyntaxProxy({
      root: `${QUERY_SYMBOLS.QUERY}.remove`,
      callback,
      replacer,
    }) as InferRemoveSyntaxProxy<T>,
    set: getSyntaxProxy({
      root: `${QUERY_SYMBOLS.QUERY}.set`,
      callback,
      replacer,
    }) as InferSetSyntaxProxy<T>,

    //------------------------------------
    // DDL Queries
    //------------------------------------
    list: getSyntaxProxy({
      root: `${QUERY_SYMBOLS.QUERY}.list`,
      callback,
      replacer,
    }) as unknown as InferListSyntaxProxy,

    // TODO(@nurodev): Add support for missing DDL queries. `create`, `alter` & `drop`.
    // TODO(@nurodev): Add support for advanced query syntax like `sql`, `sqlBatch` & `batch`.
  };
};
