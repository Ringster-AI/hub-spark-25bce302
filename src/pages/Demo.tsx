import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { allowanceSchema, sessionSchema, demoRequest, checkMicrophone, type Allowance, type DemoSession } from '../features/demo/api';
import { createDemoCall } from '../features/demo/call';

const fields = [
  ['businessName', 'Business name', 'e.g. Maple Home Services', 100],
  ['businessType', 'Type of business', 'e.g. Plumbing, salon or auto repair', 80],
  ['services', 'Services you offer', 'e.g. Leaks, drain cleaning and water heaters', 1000],
  ['serviceArea', 'Service area', 'e.g. Toronto and North York', 200],
  ['hours', 'Business hours', 'e.g. Monday–Friday, 8am–6pm', 200],
  ['agentName', 'Receptionist name', 'e.g. Alex', 60],
] as const;
type Business = Record<typeof fields[number][0], string>;
const initialBusiness: Business = { businessName: '', businessType: '', services: '', serviceArea: '', hours: '', agentName: 'Alex' };
const pending = (state: string) => !['completed', 'failed_preconnect'].includes(state);
const button = 'rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed';

export default function Demo() {
  const [business, setBusiness] = useState(initialBusiness);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [session, setSession] = useState<DemoSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [error, setError] = useState('');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const alive = useRef(true);
  const locked = useRef(false);
  const call = useRef<ReturnType<typeof createDemoCall> | null>(null);
  const callPanel = useRef<HTMLElement | null>(null);
  // Keep this key on ambiguous failures. Retrying must not create a second reservation.
  const request = useRef<{ id: string; business: Business } | null>(null);

  async function refresh() {
    const value = await demoRequest(allowanceSchema);
    if (alive.current) setAllowance(value);
    return value;
  }
  useEffect(() => {
    alive.current = true;
    void refresh().catch(e => { if (alive.current) setError(e instanceof Error ? e.message : 'Unable to load your demo.'); });
    return () => { alive.current = false; void call.current?.stop(); };
  }, []);
  useEffect(() => {
    if (phase !== 'idle') callPanel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [phase]);

  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError('');
    try { await action(); }
    catch (e) {
      if (alive.current) {
        if (!call.current) setPhase('idle');
        setError(e instanceof Error ? e.message : 'Unable to connect. Refresh the demo status.');
      }
    }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function join(value: DemoSession) {
    if (!alive.current || !value.webCallUrl || value.state !== 'ready') return;
    setPhase('connecting'); setAudioBlocked(false);
    const current = createDemoCall({
      connected: () => { if (alive.current) setPhase('live'); },
      blocked: () => { if (alive.current) setAudioBlocked(true); },
      error: () => { if (alive.current) setError('The connection ended. Check the demo status below before trying again.'); },
      ended: () => {
        call.current = null;
        if (alive.current) {
          setPhase('idle'); setAudioBlocked(false);
          void demoRequest(sessionSchema, { action: 'recover', sessionId: value.sessionId })
            .then(result => { if (alive.current) setSession(result); })
            .catch(() => { if (alive.current) setError('Your call ended. Refresh its status to retrieve the result.'); });
          void refresh().catch(() => {});
        }
      },
    });
    call.current = current;
    await current.join(value.webCallUrl);
  }
  const outstanding = allowance?.sessions.find(s => pending(s.state));
  const recentId = outstanding?.id ?? session?.sessionId ?? allowance?.sessions[0]?.id;
  const active = phase !== 'idle';
  const start = () => run(async () => {
    await checkMicrophone();
    if (!alive.current) return;
    const latest = await refresh();
    if (!alive.current) return;
    if (latest.sessions.some(s => pending(s.state))) throw new Error('An earlier demo is still pending. Check its status below.');
    if (!latest.remaining) throw new Error('You have used your three demo calls. Continue setup when you are ready.');
    request.current ??= { id: crypto.randomUUID(), business: { ...business } };
    const value = await demoRequest(sessionSchema, { action: 'prepare', requestId: request.current.id, business: request.current.business });
    request.current = null;
    if (!alive.current) return;
    setSession(value);
    await refresh();
    await join(value);
  });
  const recover = (resume: boolean) => run(async () => {
    if (!recentId) { await refresh(); return; }
    if (resume) await checkMicrophone();
    if (!alive.current) return;
    const value = await demoRequest(sessionSchema, { action: 'recover', sessionId: recentId });
    if (!alive.current) return;
    setSession(value); request.current = null;
    await refresh();
    if (resume) await join(value);
  });

  return <main className="min-h-screen bg-[#0a0a1a] px-5 py-10 text-white">
    <div className="mx-auto max-w-5xl">
      <Link className="text-indigo-200 underline" to="/dashboard">← Dashboard</Link>
      <p className="mt-10 text-sm font-semibold uppercase tracking-widest text-indigo-300">Your first Ringster call</p>
      <h1 className="mt-3 text-4xl font-bold">Hear your business come to life.</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-300">Meet your AI receptionist. Play the customer and hear how it handles an enquiry while you’re busy with a job.</p>
      <p className="mt-4 text-sm text-slate-300">3 demo calls per verified account · Up to 2 minutes each · Separate from paid credits</p>
      {error && <p role="alert" className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-amber-100">{error}</p>}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <form className="rounded-2xl border border-white/10 bg-white/5 p-6" onSubmit={event => { event.preventDefault(); void start(); }}>
          <h2 className="text-xl font-semibold">Make it yours</h2>
          <p className="mt-2 text-sm text-slate-300">A few details are enough. No phone number or calendar setup needed.</p>
          <fieldset disabled={busy || active || !!outstanding || !!request.current} className="mt-5 space-y-4 disabled:opacity-60">
            {fields.map(([key, label, placeholder, maxLength]) => <label key={key} className="block text-sm font-medium">
              {label}<input required maxLength={maxLength} value={business[key]} placeholder={placeholder}
                onChange={event => setBusiness({ ...business, [key]: event.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/20 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </label>)}
          </fieldset>
          <button className={`${button} mt-6 w-full`} disabled={busy || active || !allowance || allowance.remaining === 0 || !!outstanding}>
            {busy ? 'Checking your demo…' : 'Try my receptionist'}
          </button>
          <p className="mt-3 text-xs text-slate-300">Microphone permission is checked first. The conversation is transcribed so you can review it afterward. Use fictional customer details.</p>
        </form>
        <section ref={callPanel} className="rounded-2xl border border-indigo-400/20 bg-indigo-950/40 p-6">
          <h2 className="text-xl font-semibold">You’re the customer</h2>
          <p className="mt-4 text-slate-200">“Hi, I need some help. Are you available this week?”</p>
          <p className="mt-4 text-slate-300">Describe a job, ask about the service area, then leave a fictional name and callback number. Listen for how your receptionist gathers the details.</p>
          <div role="status" aria-live="polite" className="my-6 rounded-xl bg-black/20 p-4">
            {phase === 'live' ? '● Your receptionist is listening. You can speak now.' : phase === 'connecting' ? 'Connecting your microphone and receptionist…' : allowance ? `${allowance.remaining} demo calls remaining` : 'Checking your demo allowance…'}
          </div>
          {active && <button type="button" className="rounded-xl bg-red-600 px-5 py-3 font-semibold" onClick={() => { void call.current?.stop(); }}>End demo</button>}
          {audioBlocked && <button type="button" className={`${button} ml-2`} onClick={() => { setAudioBlocked(false); void call.current?.enableAudio(); }}>Enable audio</button>}
          {!active && <div className="flex flex-wrap gap-3">
            <button type="button" className={button} disabled={busy} onClick={() => { void recover(false); }}>{recentId ? 'Check demo status / result' : 'Refresh allowance'}</button>
            {outstanding && <button type="button" className={button} disabled={busy} onClick={() => { void recover(true); }}>Resume available demo</button>}
          </div>}
          {session && !active && <p className="mt-4 text-sm text-slate-300">
            {session.state === 'completed' ? 'Demo complete. Your transcript may take a moment to arrive.' : session.state === 'failed_preconnect' ? 'The call did not connect. This attempt was returned to your allowance.' : session.needsReconciliation ? 'We are still checking whether the call was created. Please check again later; do not start another call. Contact support if this persists.' : 'This demo is still pending. Check again shortly, or resume if the room is ready. If it is open in another tab, finish it there.'}
          </p>}
          <p className="mt-6 border-t border-white/10 pt-5 text-sm text-slate-300">This is a role-play. It won’t book appointments, transfer calls, or contact anyone. Your business phone is unchanged.</p>
        </section>
      </div>
      {session?.result?.transcript && <section className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-xl font-semibold">Your demo conversation</h2>
        <p className="mt-2 text-sm text-slate-300">A practice enquiry, not a real lead. Transcripts can contain mistakes.</p>
        <pre className="mt-5 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-slate-200">{session.result.transcript}</pre>
      </section>}
      <section className="mt-8 rounded-2xl border border-white/10 p-6">
        <h2 className="text-xl font-semibold">Imagine this on your next missed call.</h2>
        <p className="mt-2 text-slate-300">Ready to explore Ringster for your business? Review the plans, then finish setting up your receptionist.</p>
        <div className="mt-5 flex gap-5"><Link className="text-indigo-200 underline" to="/dashboard/subscription">Explore plans</Link><Link className="text-indigo-200 underline" to="/onboarding">Continue setup</Link></div>
      </section>
    </div>
  </main>;
}
