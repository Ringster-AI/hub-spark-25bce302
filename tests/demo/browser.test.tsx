// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Demo from '../../src/pages/Demo';

const mocks = vi.hoisted(() => ({ request: vi.fn(), microphone: vi.fn(), join: vi.fn(), stop: vi.fn() }));
vi.mock('../../src/features/demo/api', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/features/demo/api')>(),
  demoRequest: mocks.request, checkMicrophone: mocks.microphone,
}));
vi.mock('../../src/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('../../src/features/demo/call', () => ({ createDemoCall: () => ({ join: mocks.join, stop: mocks.stop, enableAudio: vi.fn() }) }));
const id = '11111111-1111-4111-8111-111111111111';
const allowance = { remaining: 3, sessions: [] };
function renderDemo() { return render(<MemoryRouter><Demo /></MemoryRouter>); }
async function fillAndStart() {
  for (const label of ['Business name', 'Type of business', 'Services you offer', 'Service area', 'Business hours']) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'Example' } });
  }
  await waitFor(() => expect(screen.getByText('3 demo calls remaining')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Try my receptionist' }));
}
beforeEach(() => { vi.clearAllMocks(); mocks.request.mockResolvedValue(allowance); mocks.microphone.mockResolvedValue(undefined); });
afterEach(cleanup);
describe('demo browser experience', () => {
  it('does not prepare a call when microphone permission is denied', async () => {
    mocks.microphone.mockRejectedValue(new Error('Allow microphone access'));
    renderDemo(); await fillAndStart();
    await screen.findByRole('alert');
    expect(mocks.request.mock.calls.every(args => !args[1])).toBe(true);
    expect(mocks.join).not.toHaveBeenCalled();
  });
  it('joins only the server-created room and stops it when leaving the page', async () => {
    mocks.request.mockImplementation((_schema, body) => Promise.resolve(body ? { sessionId: id, state: 'ready', webCallUrl: 'https://test.daily.co/demo' } : allowance));
    const view = renderDemo(); await fillAndStart();
    await waitFor(() => expect(mocks.join).toHaveBeenCalledWith('https://test.daily.co/demo'));
    expect(mocks.request.mock.calls.filter(args => args[1]?.action === 'prepare')).toHaveLength(1);
    view.unmount(); expect(mocks.stop).toHaveBeenCalled();
  });
  it('recovers a pending call without reserving another attempt', async () => {
    mocks.request.mockImplementation((_schema, body) => Promise.resolve(body ? { sessionId: id, state: 'uncertain', webCallUrl: null, needsReconciliation: true } : { remaining: 2, sessions: [{ id, state: 'uncertain' }] }));
    renderDemo();
    fireEvent.click(await screen.findByRole('button', { name: 'Check demo status / result' }));
    await screen.findByText(/We are still checking whether/);
    expect(mocks.request.mock.calls.some(args => args[1]?.action === 'prepare')).toBe(false);
    expect(mocks.join).not.toHaveBeenCalled();
  });
  it('shows a returned transcript as plain text, without inventing a lead', async () => {
    mocks.request.mockImplementation((_schema, body) => Promise.resolve(body ? { sessionId: id, state: 'completed', webCallUrl: null, result: { transcript: '<script>example</script>' } } : { remaining: 2, sessions: [{ id, state: 'completed' }] }));
    renderDemo(); fireEvent.click(await screen.findByRole('button', { name: 'Check demo status / result' }));
    await screen.findByText('<script>example</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText(/A practice enquiry, not a real lead/)).toBeTruthy();
  });
  it('does not create a call when unmounted while microphone permission is pending', async () => {
    let resolve!: () => void;
    mocks.microphone.mockReturnValue(new Promise<void>(done => { resolve = done; }));
    const view = renderDemo(); await fillAndStart(); view.unmount(); resolve();
    await Promise.resolve();
    expect(mocks.request.mock.calls.some(args => args[1])).toBe(false);
  });
  it('reuses its request identity after an ambiguous preparation failure', async () => {
    mocks.request.mockImplementation((_schema, body) => body ? Promise.reject(new Error('Connection lost')) : Promise.resolve(allowance));
    renderDemo(); await fillAndStart(); await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Try my receptionist' }));
    await waitFor(() => expect(mocks.request.mock.calls.filter(args => args[1]?.action === 'prepare')).toHaveLength(2));
    const preparations = mocks.request.mock.calls.filter(args => args[1]?.action === 'prepare');
    expect(preparations[0][1]).toEqual(preparations[1][1]);
  });
});
