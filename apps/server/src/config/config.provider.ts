import type { Provider } from '@nestjs/common';
import { loadConfig } from './configuration';

export const configProvider: Provider = {
  provide: 'CONFIG',
  useFactory: () => loadConfig(process.env),
};
