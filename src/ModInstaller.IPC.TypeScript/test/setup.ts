import { vi } from 'vitest';

vi.mock('vortex-api', () => ({
  log: (level: string, message: string, metadata?: any): void => {
    if (process.env.DEBUG_IPC) {
      console.log(`[${level}] ${message}`, metadata ? JSON.stringify(metadata) : '');
    }
  }
}));
