import Daily from '@daily-co/daily-js';

// Join only the room created by our authenticated server; never create a Vapi call here.
export function createDemoCall(callbacks: { connected: () => void; ended: () => void; blocked: () => void; error: () => void }) {
  const call = Daily.createCallObject({ audioSource: true, videoSource: false });
  const players = new Map<string, HTMLAudioElement>();
  let stopped = false;
  let connected = false;
  let timer: ReturnType<typeof setTimeout>;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const player of players.values()) { player.pause(); player.srcObject = null; player.remove(); }
    players.clear();
    try { await call.destroy(); } catch { callbacks.error(); } finally { callbacks.ended(); }
  };
  const fail = () => { if (!stopped) { callbacks.error(); void stop(); } };
  const play = async (player: HTMLAudioElement) => {
    try { await player.play(); if (!stopped) call.sendAppMessage('playable'); }
    catch { if (!stopped) callbacks.blocked(); }
  };
  call.on('track-started', event => {
    if (stopped || !event?.participant || event.participant.local || event.track.kind !== 'audio') return;
    const id = event.participant.session_id;
    let player = players.get(id);
    if (!player) { player = document.createElement('audio'); players.set(id, player); }
    player.srcObject = new MediaStream([event.track]);
    void play(player);
  });
  call.on('app-message', event => {
    if (!stopped && !connected && event?.data === 'listening') {
      connected = true;
      clearTimeout(timer);
      timer = setTimeout(() => { void stop(); }, 120000);
      callbacks.connected();
    }
  });
  call.on('left-meeting', () => { void stop(); });
  call.on('error', fail);
  call.on('camera-error', fail);
  return {
    async join(url: string) {
      if (stopped) return;
      timer = setTimeout(fail, 30000);
      try {
        if (new URL(url).protocol !== 'https:') throw new Error('Invalid demo room');
        await call.join({ url, subscribeToTracksAutomatically: true });
      }
      catch { fail(); }
    },
    stop,
    async enableAudio() { await Promise.all([...players.values()].map(play)); },
  };
}
