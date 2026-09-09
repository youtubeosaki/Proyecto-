import { loadConfig, type Config } from '@osaki/core';
import type { LlmProvider } from './provider.js';
import { ApiProvider } from './providers/api.js';
import { ManualProvider } from './providers/manual.js';
import { MockProvider } from './providers/mock.js';

export * from './prompts.js';
export * from './provider.js';
export { ApiProvider, ManualProvider, MockProvider };

/** Construye el proveedor que dice `LLM_PROVIDER`. Unico sitio que lo decide. */
export function createLlmProvider(config: Config = loadConfig()): LlmProvider {
  switch (config.LLM_PROVIDER) {
    case 'api':
      return new ApiProvider(config);
    case 'manual':
      return new ManualProvider(config.paths.exchange);
    case 'mock':
      return new MockProvider(config.paths.fixtures);
  }
}
