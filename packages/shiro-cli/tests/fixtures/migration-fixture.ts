import { create } from '../../../shiro-orm/dist';

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
