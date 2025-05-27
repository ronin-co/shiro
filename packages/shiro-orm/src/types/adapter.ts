import type {
  AddQuery,
  CountQuery,
  GetQuery,
  ListQuery,
  Model,
  RemoveQuery,
  SetQuery,
} from 'shiro-compiler';
import type { DeepCallable } from 'shiro-syntax/queries';
import type { InferredModel } from 'shiro-syntax/schema';

export interface SharedAdapterOptions<T extends Array<InferredModel>> {
  /**
   * A list of all experimental adapter features
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

export type InferAddSyntaxProxy<T extends Array<InferredModel>> = {
  [K in T[number] as K['~Slug']]: DeepCallable<
    AddQuery[keyof AddQuery],
    K['~Fields'] | null
  >;
};

export type InferCountSyntaxProxy<T extends Array<InferredModel>> = {
  [K in T[number] as K['~Slug']]: DeepCallable<CountQuery[keyof CountQuery], number>;
};

export type InferGetSyntaxProxy<T extends Array<InferredModel>> = {
  [K in T[number] as K['~Slug']]: DeepCallable<
    GetQuery[keyof GetQuery],
    K['~Fields'] | null
  >;
} & {
  [K in T[number] as K['~PluralSlug']]: DeepCallable<
    GetQuery[keyof GetQuery],
    Array<K['~Fields']> & {
      moreBefore?: string;
      moreAfter?: string;
    }
  >;
};

export type InferRemoveSyntaxProxy<T extends Array<InferredModel>> = {
  [K in T[number] as K['~Slug']]: DeepCallable<
    RemoveQuery[keyof RemoveQuery],
    K['~Fields'] | null
  >;
} & {
  [K in T[number] as K['~PluralSlug']]: DeepCallable<
    RemoveQuery[keyof RemoveQuery],
    Array<K['~Fields']> & {
      moreBefore?: string;
      moreAfter?: string;
    }
  >;
};

export type InferSetSyntaxProxy<T extends Array<InferredModel>> = {
  [K in T[number] as K['~Slug']]: DeepCallable<
    SetQuery[keyof SetQuery],
    K['~Fields'] | null
  >;
} & {
  [K in T[number] as K['~PluralSlug']]: DeepCallable<
    SetQuery[keyof SetQuery],
    Array<K['~Fields']> & {
      moreBefore?: string;
      moreAfter?: string;
    }
  >;
};

export type InferListSyntaxProxy = {
  /* List all model definitions */
  models: DeepCallable<ListQuery[keyof ListQuery], Array<Model>>;
};
