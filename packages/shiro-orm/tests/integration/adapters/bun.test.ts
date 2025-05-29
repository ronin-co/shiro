import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { model, string } from 'shiro-syntax/schema';

import { shiro } from '@/src/adapters/bun';

describe('adapters', () => {
  describe('bun', () => {
    test('an instance without initialized models', async () => {
      const User = model({
        slug: 'user',
        pluralSlug: 'users',
        fields: {
          name: string(),
          email: string({ required: true, unique: true }),
        },
      });

      const db = shiro({
        database: new Database(':memory:'),
        models: {
          User,
        },
      });

      const getUsers = async () => await db.get.users();

      expect(getUsers).toThrowError('no such table: users');
    });

    test('a basic singular query', async () => {
      const User = model({
        slug: 'user',
        pluralSlug: 'users',
        fields: {
          name: string(),
          email: string({ required: true, unique: true }),
        },
      });

      const db = shiro({
        database: new Database(':memory:'),
        experimental: {
          initializeModels: true,
        },
        models: {
          User,
        },
      });

      const email = 'john+doe@email.com';
      await db.add.user.with({
        name: 'John Doe',
        email,
      });

      const user = await db.get.user.with.email(email);
      expect(user).toMatchObject({
        id: expect.any(String),
        'ronin.createdAt': expect.any(String),
        'ronin.createdBy': null,
        'ronin.updatedAt': expect.any(String),
        'ronin.updatedBy': null,
        name: 'John Doe',
        email,
      });
    });

    test('a basic plural query', async () => {
      const User = model({
        slug: 'user',
        pluralSlug: 'users',
        fields: {
          name: string(),
          email: string({ required: true, unique: true }),
        },
      });

      const db = shiro({
        database: new Database(':memory:'),
        experimental: {
          initializeModels: true,
        },
        models: {
          User,
        },
      });

      const users = await db.get.users();
      expect(users).toEqual([]);
    });
  });
});
