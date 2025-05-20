#!/usr/bin/env bun

import { version } from '@/src/../package.json';
import run from '@/src/index';

run({ version });
