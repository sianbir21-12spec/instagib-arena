import AdminCoins from './AdminCoins';
import AdminDashboard from './AdminDashboard';

/**
 * Unified admin panel shell.
 * Keeps the existing analytics dashboard intact while making the server-authoritative
 * coin controls available directly from the main /admin page.
 */
export default function AdminPanel() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <AdminDashboard />
      <div className="mx-auto max-w-6xl px-4 pb-10">
        <div className="mb-4 border-t border-white/10 pt-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg uppercase tracking-[0.14em] text-cyan-300">
                Economy controls
              </h2>
              <p className="text-[11px] text-white/40">
                Admin-only player coin management. Changes are validated and applied server-side.
              </p>
            </div>
            <a
              href="/aim-lab"
              className="rounded-md border border-fuchsia-400/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-300 transition hover:border-fuchsia-300/60 hover:text-fuchsia-200"
            >
              Aim Lab →
            </a>
          </div>
          <AdminCoins />
        </div>
      </div>
    </div>
  );
}
