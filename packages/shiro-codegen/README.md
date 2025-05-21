# RONIN Codegen

[![tests](https://img.shields.io/github/actions/workflow/status/ronin-co/shiro/validate.yml?label=tests)](https://github.com/ronin-co/shiro/actions/workflows/validate.yml)
[![code coverage](https://img.shields.io/codecov/c/github/ronin-co/shiro)](https://codecov.io/github/ronin-co/shiro)
[![install size](https://packagephobia.com/badge?p=shiro-codegen)](https://packagephobia.com/result?p=shiro-codegen)

This package generates TypeScript code based on RONIN models.

## Usage
```typescript
import { generate } from 'shiro-codegen';
import { model, string } from 'shiro-orm/schema';

const User = model({
  slug: 'user',
  pluralSlug: 'users',
  fields: {
    name: string(),
    email: string({ required: true }),
  },
});

const generateCode = generate([User]);
//       ^? string
```

## Testing

Use the following command to run the test suite:

```
bun test
```
