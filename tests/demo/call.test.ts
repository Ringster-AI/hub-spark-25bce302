// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDemoCall } from '../../src/features/demo/call';
const mock = vi.hoisted(() => ({ handlers: new Map<string, (event?: unknown) => void>(), join: vi.fn(), destroy: vi.fn(), send: vi.fn() }));
vi.mock('@daily-co/daily-js', () => ({ default: { createCallObject: () => ({
  on: (name: string, handler: (event?: unknown) => void) => mock.handlers.set(name, handler),
  join: mock.join, destroy: mock.destroy, sendAppMessage: mock.send,
}) } }));
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mock.handlers.clear(); mock.join.mockResolvedValue({}); mock.destroy.mockResolvedValue(undefined); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
  const callbacks = { connected: vi.fn(), ended: vi.fn(), blocked: vi.fn(), error: vi.fn() };
  return { callbacks, call: createDemoCall(callbacks) };
}
it('ends a stalled connection and destroys media resources once', async () => {
  const { call, callbacks } = setup(); await call.join('https://demo.daily.co/test');
  await vi.advanceTimersByTimeAsync(30000);
  expect(callbacks.error).toHaveBeenCalledOnce(); expect(mock.destroy).toHaveBeenCalledOnce();
  await call.stop(); expect(mock.destroy).toHaveBeenCalledOnce(); expect(callbacks.ended).toHaveBeenCalledOnce();
});
it('starts the local duration limit on listening and ignores duplicate listening events', async () => {
  const { call, callbacks } = setup(); await call.join('https://demo.daily.co/test');
  mock.handlers.get('app-message')?.({ data: 'listening' });
  await vi.advanceTimersByTimeAsync(60000);
  mock.handlers.get('app-message')?.({ data: 'listening' });
  await vi.advanceTimersByTimeAsync(60000);
  expect(callbacks.connected).toHaveBeenCalledOnce(); expect(mock.destroy).toHaveBeenCalledOnce();
});
it('waits for successful audio playback before announcing playable and supports retry', async () => {
  vi.stubGlobal('MediaStream', class {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('NotAllowed')).mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const { call, callbacks } = setup(); await call.join('https://demo.daily.co/test');
  mock.handlers.get('track-started')?.({ participant: { session_id: 'speaker', local: false }, track: { kind: 'audio' } });
  await Promise.resolve(); await Promise.resolve();
  expect(callbacks.blocked).toHaveBeenCalledOnce(); expect(mock.send).not.toHaveBeenCalled();
  await call.enableAudio(); expect(play).toHaveBeenCalledTimes(2); expect(mock.send).toHaveBeenCalledWith('playable');
  await call.stop();
});
it('does not join after disposal', async () => {
  const { call } = setup(); await call.stop(); await call.join('https://demo.daily.co/test');
  expect(mock.join).not.toHaveBeenCalled();
});
