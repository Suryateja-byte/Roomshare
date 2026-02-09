import type { CurrentsConfig } from '@currents/playwright';

const config: CurrentsConfig = {
  recordKey: process.env.CURRENTS_RECORD_KEY || 'm7J6BG8ao53acAy4',
  projectId: process.env.CURRENTS_PROJECT_ID || 'zz7AZ8',
};

export default config;
