import type { RoomObject } from './room-object';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  ASSETS: Fetcher;
  CREATE_ROOM_LIMIT: RateLimit;
}
