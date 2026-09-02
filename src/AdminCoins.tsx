import { useEffect, useState } from 'react';

export default function AdminCoins() {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('1000');
  const [reason, setReason] = useState('admin grant');
  const [balance, setBalance] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user?: { isAdmin?: boolean } | null }) => setAllowed(!!d.user?.isAdmin))
      .catch(() => setAllowed(false))
      .finally(() => setReady(true));
  }, []);

  const lookup = async () => {
    setMessage('');
    setBalance(null);
    const r = await fetch(`/api/auth/admin/coins?username=${encodeURIComponent(username.trim())}`, { credentials: 'same-origin' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessage(d.error === 'not_found' ? 'Player not found.' : 'Unable to look up player.');
      return;
    }
    setBalance(Number(d.credits ?? 0));
  };

  const grant = async () => {
    if (busy || !username.trim()) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/auth/admin/coins/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ username: username.trim(), amount: Number(amount), reason: reason.trim() || 'admin grant' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(d.error === 'not_found' ? 'Player not found.' : `Grant failed: ${d.error ?? r.status}`);
        return;
      }
      setBalance(Number(d.balance));
      setMessage(`${d.amount > 0 ? '+' : ''}${d.amount} coins applied. New balance: ${d.balance}.`);
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <div className='p-8 text-white/50'>Checking admin access…</div>;
  if (!allowed) return <div className='p-8 text-rose-300'>Admin access required.</div>;

  return (
    <main className='min-h-screen bg-zinc-950 px-6 py-10 text-white'>
      <div className='mx-auto max-w-xl'>
        <div className='mb-8'>
          <p className='text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300'>Admin economy</p>
          <h1 className='mt-2 text-3xl font-black tracking-tight'>Coin control</h1>
          <p className='mt-2 text-sm text-white/45'>Server-authoritative grants. Every mutation is audit logged and mirrored to Firebase when configured.</p>
        </div>
        <section className='rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl'>
          <label className='block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40'>Player username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder='Player name' className='mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 font-mono outline-none focus:border-cyan-400/50' />
          <div className='mt-4 grid grid-cols-2 gap-4'>
            <div>
              <label className='block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40'>Amount</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type='number' step='1' className='mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 font-mono outline-none focus:border-cyan-400/50' />
            </div>
            <div>
              <label className='block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40'>Reason</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className='mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-cyan-400/50' />
            </div>
          </div>
          <div className='mt-5 flex gap-3'>
            <button onClick={lookup} disabled={!username.trim()} className='rounded-lg border border-white/15 px-4 py-3 text-xs font-bold uppercase tracking-[0.15em] text-white/70 hover:bg-white/5 disabled:opacity-40'>Check balance</button>
            <button onClick={grant} disabled={busy || !username.trim()} className='rounded-lg bg-cyan-400 px-5 py-3 text-xs font-black uppercase tracking-[0.15em] text-zinc-950 hover:bg-cyan-300 disabled:opacity-40'>{busy ? 'Applying…' : 'Apply coins'}</button>
          </div>
          {balance !== null && <div className='mt-6 rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-sm'>Current balance: <strong className='font-mono text-cyan-300'>{balance.toLocaleString()}</strong></div>}
          {message && <div className='mt-3 text-sm text-white/60'>{message}</div>}
        </section>
      </div>
    </main>
  );
}
