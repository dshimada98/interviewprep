import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useStarSession, useUnstarSession, type PracticeSession, type PracticeSessionDetail, type SessionList } from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';
import { detailKey, invalidateLists, isListQuery, paramsOfKey, statusOf } from './session-keys';

/* ---------------- Stars ---------------- */

export const STAR_ERROR = "Couldn't update the star. Please try again.";
const inflight = new Set<string>();
const byNewest = (a: PracticeSession, b: PracticeSession) =>
  a.session_date < b.session_date ? 1 : a.session_date > b.session_date ? -1 : b.id - a.id;

export type StarToggle = ReturnType<typeof useStarToggle>;

export function useStarToggle() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const starM = useStarSession({ request: sessionRequestOptions() });
  const unstarM = useUnstarSession({ request: sessionRequestOptions() });
  const starRef = useRef(starM.mutateAsync); starRef.current = starM.mutateAsync;
  const unstarRef = useRef(unstarM.mutateAsync); unstarRef.current = unstarM.mutateAsync;
  const [pending, setPending] = useState<Record<number, boolean>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  // Patch only the one session in each cached list variant so concurrent toggles on other cards are
  // never overwritten. Never re-run search in the browser: matching rows are patched in place, unstarred
  // rows leave starred variants (remembering their position for rollback), and a newly starred row is
  // only inserted into the plain starred list, where it is known to match. Totals never change.
  type Removed = Map<string, number>;
  function apply(s: PracticeSession, on: boolean, uid?: number, restore?: Removed): Removed {
    const removed: Removed = new Map();
    for (const [key, old] of qc.getQueriesData<SessionList>({ predicate: isListQuery(uid) })) {
      if (!old) continue;
      const p = paramsOfKey(key);
      const hash = JSON.stringify(key);
      const idx = old.sessions.findIndex(x => x.id === s.id);
      if (p.starred && !on) {
        if (idx >= 0) { removed.set(hash, idx); qc.setQueryData<SessionList>(key, { ...old, sessions: old.sessions.filter(x => x.id !== s.id) }); }
      } else if (idx >= 0) {
        qc.setQueryData<SessionList>(key, { ...old, sessions: old.sessions.map(x => (x.id === s.id ? { ...x, starred: on } : x)) });
      } else if (p.starred && on) {
        const at = restore?.get(hash);
        const row = { ...s, starred: true };
        if (at !== undefined) {
          const next = [...old.sessions]; next.splice(Math.min(at, next.length), 0, row);
          qc.setQueryData<SessionList>(key, { ...old, sessions: next });
        } else if (Object.keys(p).length === 1) {
          qc.setQueryData<SessionList>(key, { ...old, sessions: [...old.sessions, row].sort(byNewest) });
        }
      }
    }
    qc.setQueryData<PracticeSessionDetail>(detailKey(s.id, uid), old => (old ? { ...old, starred: on } : old));
    return removed;
  }

  async function toggle(s: PracticeSession) {
    const uid = user?.id;
    const k = `${uid}:${s.id}`;
    if (inflight.has(k)) return;
    inflight.add(k);
    const next = !s.starred;
    setPending(p => ({ ...p, [s.id]: true }));
    setErrors(e => { const n = { ...e }; delete n[s.id]; return n; });
    await Promise.all([
      qc.cancelQueries({ predicate: isListQuery(uid) }),
      qc.cancelQueries({ queryKey: detailKey(s.id, uid), exact: true }),
    ]);
    const removed = apply(s, next, uid);
    try {
      await (next ? starRef.current : unstarRef.current)({ id: s.id });
    } catch (e) {
      apply(s, !next, uid, removed);
      setErrors(er => ({ ...er, [s.id]: STAR_ERROR }));
      if (statusOf(e) === 401) void refresh();
    } finally {
      inflight.delete(k);
      setPending(p => { const n = { ...p }; delete n[s.id]; return n; });
      // Refetch lists only once no toggle for this user is pending, so a refetch cannot
      // overwrite another session's optimistic state. A failed refetch keeps cached data.
      if (![...inflight].some(x => x.startsWith(`${uid}:`))) {
        void invalidateLists(qc, uid);
      }
      void qc.invalidateQueries({ queryKey: detailKey(s.id, uid), exact: true });
    }
  }
  return { toggle, pending, errors };
}

export function StarButton({ session, star }: { session: PracticeSession; star: StarToggle }) {
  const on = session.starred;
  return (
    <button type="button" data-testid={`button-star-${session.id}`}
      aria-label={on ? 'Unstar this session' : 'Star this session'} aria-pressed={on}
      aria-busy={!!star.pending[session.id]}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void star.toggle(session); }}
      className="ip-focus h-11 w-11 min-h-11 min-w-11 shrink-0 grid place-items-center rounded-lg border bg-white transition-transform active:scale-90 hover:border-[color:var(--navy)]"
      style={{ borderColor: on ? '#1F2A44' : undefined }}>
      <Star className="h-5 w-5" aria-hidden strokeWidth={2} style={{ color: '#1F2A44', fill: on ? '#1F2A44' : 'none' }} />
    </button>
  );
}

