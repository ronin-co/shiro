import { Database } from 'bun:sqlite';

import type { Model } from 'shiro-compiler';

interface ShiroOptions<T extends Array<Model>> {
  database?: Database;
  models: T;
}

/**
 * @todo Add documentation
 */
export const shiro = <T extends Array<Model>>(options: ShiroOptions<T>) => {
  const database = options.database ?? new Database(':memory:');
};
