import { get } from 'shiro-orm';

export default () => [get.account.with({ handle: 'elaine' })];
