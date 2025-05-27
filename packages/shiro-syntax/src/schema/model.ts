import { getSyntaxProxy } from '@/src/queries';
import type {
  Chain,
  FieldOutput,
  SyntaxField,
  blob,
  boolean,
  date,
  json,
  link,
  number,
  string,
} from '@/src/schema';
import type {
  ModelField,
  ModelIndex,
  ModelPreset,
  Model as RawModel,
  StoredObject,
} from 'shiro-compiler';

// This is used to ensure that any object adhering to this interface has both fields.
export interface RoninFields {
  /**
   * The unique identifier for this record.
   */
  id: string;

  /**
   * Contains metadata about the record like creation date, last update, etc.
   */
  ronin: string;
}

export type Primitives =
  | ReturnType<typeof link>
  | ReturnType<typeof string>
  | ReturnType<typeof boolean>
  | ReturnType<typeof number>
  | ReturnType<typeof json>
  | ReturnType<typeof date>
  | ReturnType<typeof blob>
  | NestedFieldsPrimitives
  | Chain<
      FieldOutput<'string' | 'number' | 'boolean' | 'link' | 'json' | 'date' | 'blob'>,
      | 'name'
      | 'displayAs'
      | 'unique'
      | 'required'
      | 'defaultValue'
      | 'computedAs'
      | 'check'
    >;

export type PrimitivesItem =
  | SyntaxField<'link'>
  | SyntaxField<'string'>
  | SyntaxField<'boolean'>
  | SyntaxField<'number'>
  | SyntaxField<'json'>
  | SyntaxField<'date'>
  | SyntaxField<'blob'>
  | NestedFieldsPrimitivesItem;

export interface NestedFieldsPrimitives {
  [key: string]: Primitives;
}

export interface NestedFieldsPrimitivesItem {
  [key: string]: PrimitivesItem;
}

export interface Model<
  TSlug extends string = string,
  TPluralSlug extends string = string,
  TFields extends
    RecordWithoutForbiddenKeys<Primitives> = RecordWithoutForbiddenKeys<Primitives>,
> extends Omit<RawModel, 'slug' | 'fields' | 'indexes' | 'presets'> {
  /**
   * The unique singular identifier for this model, used in the database.
   */
  slug: TSlug;

  /**
   * The unique plural identifier for this model, used in the database.
   */
  pluralSlug: TPluralSlug;

  /**
   * The fields that make up this model.
   */
  fields?: TFields;

  /**
   * Database indexes to optimize query performance.
   */
  indexes?: Record<string, Omit<ModelIndex<Record<keyof TFields, ModelField>>, 'slug'>>;

  /**
   * Predefined query instructions that can be reused across multiple different queries.
   */
  presets?:
    | Record<string, Omit<ModelPreset, 'slug'>>
    | ((fields: keyof TFields) => Record<string, Omit<ModelPreset, 'slug'>>);
}

// This type maps the fields of a model to their types.
type FieldToTypeMap = {
  blob: StoredObject;
  boolean: boolean;
  date: Date;
  json: object;
  link: string;
  number: number;
  string: string;
};
type FieldsToTypes<F> = F extends Record<string, Primitives>
  ? {
      [K in keyof F]: F[K] extends Record<string, Primitives>
        ? FieldsToTypes<F[K]>
        : F[K]['type'] extends keyof FieldToTypeMap
          ? FieldToTypeMap[F[K]['type']]
          : object;
    }
  : RoninFields;

// Forbidden field keys.
type ForbiddenKeys =
  | 'id'
  | 'ronin'
  | 'ronin.updatedAt'
  | 'ronin.createdBy'
  | 'ronin.updatedBy'
  | 'ronin.createdAt'
  | 'ronin.locked';

// Exclude forbidden keys.
export type RecordWithoutForbiddenKeys<V> = {
  [K in Exclude<string, ForbiddenKeys>]: V;
} & {
  [K in ForbiddenKeys]?: never;
};

// This type expands to show the properties and their types rather than `FieldsToTypes`.
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type InferredModel<
  TSlug extends string = string,
  TPluralSlug extends string = string,
  TFields = unknown,
> = object & {
  '~Slug': TSlug;
  '~PluralSlug': TPluralSlug;
  '~Fields': TFields;
};

/**
 * Generates a model definition and adds default fields to the provided model.
 *
 * @example
 * ```ts
 * const Account = model({
 *   slug: 'account',
 *   pluralSlug: 'accounts',
 *   fields: {
 *     name: string()
 *   },
 * });
 * ```
 *
 * @template TSlug - A string representing the singular slug of the model.
 * @template TPluralSlug - A string representing the plural slug of the model.
 * @template TFields - A generic type representing the model structure, which contains a slug and fields.
 * @param model - An object containing the slug and fields of the model.
 *
 * @returns The generated model definition.
 */
export const model = <
  TSlug extends string,
  TPluralSlug extends string,
  // biome-ignore lint/complexity/noBannedTypes: `Fields` requires an empty object as a fallback.
  TFields extends RecordWithoutForbiddenKeys<Primitives> = {},
>(
  model: Model<TSlug, TPluralSlug, TFields> | (() => Model<TSlug, TPluralSlug, TFields>),
): InferredModel<TSlug, TPluralSlug, Expand<RoninFields & FieldsToTypes<TFields>>> => {
  return getSyntaxProxy({ modelType: true, chaining: false })(
    model,
  ) as unknown as InferredModel<
    TSlug,
    TPluralSlug,
    Expand<RoninFields & FieldsToTypes<TFields>>
  >;
};
