import { get } from '../../../shiro-orm/dist';

export default () => [get.account.with({ handle: 'elaine' })];
