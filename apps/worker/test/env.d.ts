import type { Env as WorkerEnv } from '../src/env';

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import('../src/index');
      durableNamespaces: 'RoomObject';
    }
    interface Env extends WorkerEnv {}
  }
}
