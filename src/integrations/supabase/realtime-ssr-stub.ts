/**
 * SSR-only stub for @supabase/realtime-js.
 *
 * The real @supabase/realtime-js module (and its transitive imports)
 * pulls in browser/tslib-heavy code that breaks under Cloudflare
 * workerd during SSR. Realtime is a browser-only concern for this app,
 * so on the server we replace the module with an inert stub via a
 * Vite SSR alias (see vite.config.ts).
 *
 * The exported RealtimeClient is a no-op: it stores config, returns
 * empty channels, and never opens a WebSocket. supabase-js constructs
 * it during createClient() but nothing calls .channel() on the server.
 *
 * Any actual realtime usage happens exclusively in browser code,
 * where the real module is bundled normally.
 */

const noop = () => {};
const asyncOk = async () => "ok";

class StubChannel {
  constructor(public topic: string, public params: unknown = {}) {}
  on() { return this; }
  subscribe(cb?: (status: string) => void) { cb?.("SUBSCRIBED"); return this; }
  unsubscribe() { return asyncOk(); }
  send() { return asyncOk(); }
  track() { return asyncOk(); }
  untrack() { return asyncOk(); }
  presenceState() { return {}; }
  push() { return this; }
  receive() { return this; }
  off = noop;
  teardown = noop;
}

export class RealtimeClient {
  channels: StubChannel[] = [];
  accessTokenValue: string | null = null;
  constructor(public endPoint: string = "", public options: unknown = {}) {}
  connect() {}
  disconnect() { return { error: null, data: {} }; }
  channel(topic: string, params?: unknown) {
    const ch = new StubChannel(topic, params);
    this.channels.push(ch);
    return ch;
  }
  getChannels() { return this.channels; }
  removeChannel() { return asyncOk(); }
  removeAllChannels() { return asyncOk(); }
  setAuth(token: string | null) { this.accessTokenValue = token; }
  isConnected() { return false; }
  log = noop;
  endPointURL() { return this.endPoint; }
}

export default RealtimeClient;
export class RealtimeChannel extends StubChannel {}
export class RealtimePresence {}
export const REALTIME_LISTEN_TYPES = {} as Record<string, string>;
export const REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {} as Record<string, string>;
export const REALTIME_PRESENCE_LISTEN_EVENTS = {} as Record<string, string>;
export const REALTIME_SUBSCRIBE_STATES = {} as Record<string, string>;
export const REALTIME_CHANNEL_STATES = {} as Record<string, string>;
export const postgresChangesFilter = () => ({});
export class RealtimePostgresFilterBuilder {}
export class WebSocketFactory {}
