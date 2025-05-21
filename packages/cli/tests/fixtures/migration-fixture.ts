import { create } from 'shiro-orm';

export default () => [
  create.model({
    slug: 'user',
    fields: {
      name: {
        type: 'string',
      },
    },
  }),
];
