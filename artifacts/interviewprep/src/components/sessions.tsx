import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, BookOpen, CalendarDays, Clock, Loader2, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import {
  getGetQuestionTypesQueryKey,
  useCreateSession, useDeleteSession, useGetQuestionTypes, useGetSession, useGetStory, useListSessions, useUpdateSession,
  type PracticeSession, type PracticeSessionDetail, type SessionInput,
} from '@workspace/api-client-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { sessionRequestOptions, useAuth } from '@/auth';
import { AppHeader } from './ip';
import { detailKey, invalidateLists, listKey, removeFromLists, starredKey, statusOf, storyDetailKey } from './session-keys';
import { StorySelect } from './story-select';
import { CategorySelect } from './category-select';
import { CaseBookSelect, NO_BOOK, useCaseBooks } from './case-book-select';
import { caseBookLabel } from './case-book-label';
import { ExportButton } from './export-button';
import { ClearFilters, FinderControls, useSessionFinder } from './session-finder';
import { STAR_ERROR, StarButton, useStarToggle, type StarToggle } from './session-stars';
import { AddNoteButton } from './checklist';
import { ScorecardEditor, ScorecardView, draftsFrom, draftsToInput, useCaseSections, type ScoreDrafts } from './scorecard';

const FORMATS = [
  { v: 'solo', label: 'Solo' },
  { v: 'partner', label: 'Partner' },
  { v: 'mock', label: 'Mock' },
] as const;
const SCORE_LABEL = ['', 'Struggled', 'Shaky', 'Solid', 'Strong', 'Excellent'];
const MAX_INT = 2147483647;


export function use401(error: unknown) {
  const { refresh } = useAuth();
  useEffect(() => { if (statusOf(error) === 401) void refresh(); }, [error, refresh]);
}

export function SessionCacheGuard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const prev = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const id = user?.id ?? null;
    if (prev.current !== undefined && prev.current !== id) {
      // Do not cancel queries mounted by the incoming user's page.
      qc.removeQueries({ predicate: query => query.queryKey.at(-1) !== id });
    }
    prev.current = id;
  }, [user?.id, qc]);
  return null;
}


export function fmtDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
}
const fmtLabel = (f: string) => FORMATS.find(x => x.v === f)?.label ?? f;

export function Shell({ children, title }: { children: ReactNode; title: string }) {
  useEffect(() => { document.title = `${title} | InterviewPrep`; }, [title]);
  return (
    <div className="min-h-[100dvh]">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-14" style={{ color: 'var(--navy)' }}>{children}</main>
    </div>
  );
}

export function ErrText({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-2 text-sm font-medium" style={{ color: '#C0392B' }}>
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden /><span>{children}</span>
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} data-testid="link-back" className="ip-focus inline-flex min-h-11 items-center gap-2 rounded text-sm font-semibold hover:underline underline-offset-4">
      <ArrowLeft className="h-4 w-4" aria-hidden />{children}
    </Link>
  );
}

export function ErrorPanel({ msg, onRetry, busy }: { msg: string; onRetry: () => void; busy: boolean }) {
  return (
    <div className="ip-rise mt-6 rounded-xl p-6 border-l-4 space-y-4" style={{ background: 'var(--panel)', borderColor: 'var(--score-1)' }}>
      <ErrText>{msg}</ErrText>
      <button data-testid="button-retry" onClick={onRetry} disabled={busy}
        className="ip-focus min-h-11 px-5 rounded-lg font-semibold text-white disabled:opacity-60" style={{ background: 'var(--navy)' }}>
        {busy ? 'Retrying...' : 'Retry'}
      </button>
    </div>
  );
}

export function ScoreBar({ score, size = 'sm' }: { score: number; size?: 'sm' | 'lg' }) {
  const h = size === 'lg' ? [10, 16, 22, 28, 34] : [6, 9, 12, 15, 18];
  return (
    <span className="inline-flex items-end gap-[3px]" role="img" aria-label={`Overall score ${score} of 5, ${SCORE_LABEL[score]}`}>
      {h.map((px, i) => (
        <span key={i} className="rounded-sm" style={{ width: size === 'lg' ? 8 : 5, height: px, background: i < score ? `var(--score-${score})` : 'hsl(var(--border))' }} />
      ))}
    </span>
  );
}

function KindTag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em]"
      style={kind === 'case' ? { background: 'var(--navy)', color: 'white' } : { border: '1px solid var(--green)', color: 'var(--green-text)' }}>
      {kind === 'case' ? 'Case' : 'Behavioral'}
    </span>
  );
}

function SessionCards({ data, star }: { data: PracticeSession[]; star: StarToggle }) {
  return (
    <ul className="mt-8 space-y-3" aria-label="Practice sessions">
      {data.map((s, i) => (
        <li key={s.id} className="ip-rise relative" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <Link href={`/sessions/${s.id}`} data-testid={`card-session-${s.id}`}
            className="ip-focus group block rounded-xl border bg-white p-4 pr-16 sm:p-5 sm:pr-20 transition-colors hover:border-[color:var(--navy)]"
            style={{ borderLeft: `4px solid var(--score-${s.overall_score})` }}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-semibold"><CalendarDays className="h-4 w-4" aria-hidden />{fmtDate(s.session_date)}</span>
              <KindTag kind={s.kind} />
              <span className="text-muted-foreground">{s.question_type_name}</span>
              <span className="ml-auto inline-flex items-center gap-2"><ScoreBar score={s.overall_score} /><span className="rounded-full px-2.5 py-1 font-semibold tabular-nums text-white" style={{ background: `var(--score-${s.overall_score})` }}>{s.overall_score}/5</span></span>
            </div>
            <p className="mt-2.5 font-medium line-clamp-2 break-words group-hover:underline underline-offset-4">{s.prompt}</p>
            {s.kind === 'case' && <p className="mt-1.5 text-xs text-muted-foreground break-words" data-testid={`text-case-book-${s.id}`}>{caseBookLabel(s.case_book_name ?? NO_BOOK, s.case_book_publication_year)}</p>}
            <p className="mt-1 text-xs text-muted-foreground">{fmtLabel(s.format)}{s.duration_minutes != null ? ` / ${s.duration_minutes} min` : ''}</p>
          </Link>
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4"><StarButton session={s} star={star} /></div>
          {star.errors[s.id] && <div className="px-4 pt-2" data-testid={`status-star-error-${s.id}`}><ErrText>{star.errors[s.id]}</ErrText></div>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- List ---------------- */

export function SessionsListPage() {
  const { user } = useAuth();
  const f = useSessionFinder();
  // Each param set has its own cache key; React Query aborts the superseded request, so a late
  // response for an old search can never overwrite the current results.
  const q = useListSessions(f.params, {
    query: { queryKey: listKey(user?.id, f.params), enabled: !!user && f.ready, refetchOnMount: 'always', retry: false, placeholderData: keepPreviousData },
    request: sessionRequestOptions(),
  });
  use401(q.error);
  const star = useStarToggle();
  const data = q.data;
  const none = data && data.total === 0 && !f.active;
  return (
    <Shell title="Practice sessions">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div className="ip-rise">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Practice log</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Your sessions</h1>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
        <ExportButton />
        <Link href="/sessions/new" data-testid="link-new-session"
          className="ip-focus ip-rise min-h-11 px-5 rounded-lg inline-flex items-center justify-center gap-2 font-semibold text-white"
          style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
          <Plus className="h-4 w-4" aria-hidden />Log a session
        </Link>
        </div>
      </div>

      <FinderControls f={f} />
      {data && (
        <div className="mt-4 flex min-h-11 flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" data-testid="text-session-count" aria-live="polite">
            Showing <span className="font-semibold tabular-nums" style={{ color: 'var(--navy)' }}>{data.sessions.length}</span> of <span className="tabular-nums">{data.total}</span> sessions
            {q.isFetching && <span className="sr-only"> Updating results</span>}
          </p>
          {f.active && <ClearFilters f={f} />}
        </div>
      )}

      {q.isLoading || (!data && !f.ready) ? (
        <div className="mt-8 space-y-3" aria-busy="true"><span className="sr-only" role="status">Loading sessions</span>
          {[0, 1, 2].map(i => <div key={i} className="ip-skel h-24 rounded-xl" />)}
        </div>
      ) : q.error && !data ? (
        <ErrorPanel msg="Unable to load your sessions. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : none ? (
        <div className="ip-rise mt-8 rounded-xl p-8 sm:p-12 text-center" style={{ background: 'var(--panel)' }} data-testid="status-empty">
          <div className="mx-auto w-fit"><ScoreBar score={3} size="lg" /></div>
          <h2 className="mt-5 text-xl font-bold">No sessions yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">Record your first case or behavioral practice to start building a track record you can learn from.</p>
          <Link href="/sessions/new" className="ip-focus mt-6 min-h-11 px-5 rounded-lg inline-flex items-center gap-2 font-semibold text-white" style={{ background: 'var(--navy)' }}>
            <Plus className="h-4 w-4" aria-hidden />Log your first session
          </Link>
        </div>
      ) : data && data.sessions.length === 0 ? (
        <div className="ip-rise mt-6 rounded-xl border border-dashed p-8 sm:p-10 text-center" data-testid="status-no-results">
          <Search className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-semibold">No sessions match your search.</p>
          <div className="mt-5"><ClearFilters f={f} solid /></div>
        </div>
      ) : data ? <div className={q.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}><SessionCards data={data.sessions} star={star} /></div> : null}
    </Shell>
  );
}

export function StarredPage() {
  const { user } = useAuth();
  const q = useListSessions({ starred: true }, {
    query: { queryKey: starredKey(user?.id), enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  use401(q.error);
  const star = useStarToggle();
  const data = q.data?.sessions;
  // Errors for cards no longer shown (e.g. removed from this list) stay visible here.
  const orphanErr = Object.keys(star.errors).some(id => !data?.some(s => String(s.id) === id));
  return (
    <Shell title="Starred">
      <div className="ip-rise">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Redo list</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Starred</h1>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-starred-subtitle">Your redo list</p>
      </div>
      {orphanErr && <div className="mt-6 rounded-lg border-l-4 bg-white p-3" style={{ borderColor: 'var(--score-1)' }} data-testid="status-star-error"><ErrText>{STAR_ERROR}</ErrText></div>}
      {q.isLoading ? (
        <div className="mt-8 space-y-3" aria-busy="true"><span className="sr-only" role="status">Loading starred sessions</span>
          {[0, 1].map(i => <div key={i} className="ip-skel h-24 rounded-xl" />)}
        </div>
      ) : q.error && !data ? (
        <ErrorPanel msg="Unable to load your starred sessions. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : data && data.length === 0 ? (
        <div className="ip-rise mt-8 rounded-xl p-8 sm:p-12 text-center" style={{ background: 'var(--panel)' }} data-testid="status-empty-starred">
          <Star className="mx-auto h-8 w-8" aria-hidden style={{ color: '#1F2A44' }} />
          <p className="mt-4 font-semibold">No starred sessions yet. Star a session you want to redo.</p>
          <Link href="/sessions" className="ip-focus mt-6 min-h-11 px-5 rounded-lg inline-flex items-center gap-2 font-semibold text-white" style={{ background: 'var(--navy)' }}>Browse your sessions</Link>
        </div>
      ) : data ? <SessionCards data={data} star={star} /> : null}
    </Shell>
  );
}

/* ---------------- Detail ---------------- */

function useSessionId(raw: string | undefined) {
  const n = raw && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_INT ? n : null;
}

function NotFoundPanel() {
  return (
    <div className="ip-rise mt-6 rounded-xl p-8 text-center" style={{ background: 'var(--panel)' }} data-testid="status-not-found">
      <h1 className="text-2xl font-bold">Session not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or the link is incorrect.</p>
      <Link href="/sessions" className="ip-focus mt-6 min-h-11 px-5 rounded-lg inline-flex items-center font-semibold text-white" style={{ background: 'var(--navy)' }}>Back to sessions</Link>
    </div>
  );
}

function useSessionQuery(id: number | null) {
  const { user } = useAuth();
  const q = useGetSession(id ?? 0, {
    query: { queryKey: detailKey(id ?? 0, user?.id), enabled: !!user && id !== null, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  use401(q.error);
  return q;
}

export function SessionDetailPage({ rawId }: { rawId?: string }) {
  const id = useSessionId(rawId);
  const { user } = useAuth();
  const q = useSessionQuery(id);
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [open, setOpen] = useState(false);
  const [delErr, setDelErr] = useState('');
  const del = useDeleteSession({ request: sessionRequestOptions() });
  use401(del.error);
  const star = useStarToggle();

  function confirmDelete() {
    if (id === null) return;
    setDelErr('');
    del.mutate({ id }, {
      onSuccess: () => {
        qc.removeQueries({ queryKey: detailKey(id, user?.id) });
        removeFromLists(qc, user?.id, id);
        void invalidateLists(qc, user?.id);
        setOpen(false);
        nav('/sessions');
      },
      onError: (e) => {
        if (statusOf(e) === 404) { setOpen(false); qc.removeQueries({ queryKey: detailKey(id, user?.id) }); void invalidateLists(qc, user?.id); nav('/sessions'); return; }
        setOpen(false);
        setDelErr('Unable to delete this session. Please try again.');
      },
    });
  }

  const s = q.data;
  return (
    <Shell title={s ? 'Session' : 'Session'}>
      <BackLink href="/sessions">All sessions</BackLink>
      {id === null || statusOf(q.error) === 404 ? <NotFoundPanel /> : q.isLoading ? (
        <div className="mt-6 space-y-4" aria-busy="true"><span className="sr-only" role="status">Loading session</span>
          <div className="ip-skel h-8 w-56 rounded" /><div className="ip-skel h-28 rounded-xl" /><div className="ip-skel h-40 rounded-xl" />
        </div>
      ) : q.error ? (
        <ErrorPanel msg="Unable to load this session. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : s ? (
        <article className="mt-4">
          <header className="ip-rise flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <KindTag kind={s.kind} />
                <span className="font-semibold">{s.question_type_name}</span>
              </div>
              {s.kind === 'case' && <p className="mt-2 text-sm text-muted-foreground break-words" data-testid="text-case-book">{caseBookLabel(s.case_book_name ?? NO_BOOK, s.case_book_publication_year)}</p>}
              <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight break-words whitespace-pre-wrap" data-testid="text-prompt">{s.prompt}</h1>
              {s.kind === 'behavioral' && s.story_id != null && (
                <p className="mt-3 text-sm" data-testid="text-story-used">
                  <span className="text-muted-foreground">Story used: </span>
                  <Link href={`/stories/${s.story_id}`} data-testid="link-session-story" className="ip-focus inline-flex min-h-11 items-center gap-1.5 rounded font-semibold underline underline-offset-4 decoration-2 break-words" style={{ textDecorationColor: 'var(--green)' }}>
                    <BookOpen className="h-4 w-4 shrink-0" aria-hidden />{s.story_title ?? 'Untitled story'}
                  </Link>
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <StarButton session={s} star={star} />
              <Link href={`/sessions/${s.id}/edit`} data-testid="link-edit-session"
                className="ip-focus min-h-11 flex-1 lg:flex-none px-4 rounded-lg inline-flex items-center justify-center gap-2 font-semibold border bg-white hover:border-[color:var(--navy)]">
                <Pencil className="h-4 w-4" aria-hidden />Edit
              </Link>
              <button type="button" data-testid="button-delete-session" onClick={() => setOpen(true)}
                className="ip-focus min-h-11 flex-1 lg:flex-none px-4 rounded-lg inline-flex items-center justify-center gap-2 font-semibold border bg-white"
                style={{ color: 'var(--score-1)', borderColor: 'var(--score-1)' }}>
                <Trash2 className="h-4 w-4" aria-hidden />Delete
              </button>
            </div>
          </header>
          {star.errors[s.id] && <div className="mt-4 rounded-lg border-l-4 bg-white p-3" style={{ borderColor: 'var(--score-1)' }} data-testid="status-star-error"><ErrText>{star.errors[s.id]}</ErrText></div>}
          {delErr && <div className="mt-4 rounded-lg border-l-4 bg-white p-3" style={{ borderColor: 'var(--score-1)' }}><ErrText>{delErr}</ErrText></div>}

          <dl className="ip-rise mt-8 grid grid-cols-2 lg:grid-cols-4 rounded-xl overflow-hidden" style={{ background: 'var(--panel)', animationDelay: '60ms' }}>
            {[
              ['Date', <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden />{fmtDate(s.session_date)}</span>],
              ['Format', fmtLabel(s.format)],
              ['Duration', <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden />{s.duration_minutes != null ? `${s.duration_minutes} min` : 'Not recorded'}</span>],
              ['Overall score', <span className="inline-flex flex-wrap items-center gap-2.5"><ScoreBar score={s.overall_score} size="lg" /><span className="tabular-nums">{s.overall_score}/5</span><span className="text-xs text-muted-foreground font-medium">{SCORE_LABEL[s.overall_score]}</span></span>],
            ].map(([k, v], i) => (
              <div key={i} className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r last:border-r-0 border-white">
                <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{k}</dt>
                <dd className="mt-2 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          {s.kind === 'case' && <ScorecardView scores={s.section_scores ?? []} sessionId={s.id} />}

          <div className="ip-rise mt-6 grid gap-4 md:grid-cols-2" style={{ animationDelay: '120ms' }}>
            {([['What went well', s.went_well, 'var(--green)'], ['To improve', s.to_improve, 'var(--score-3)']] as const).map(([k, v, c]) => (
              <section key={k} className="rounded-xl border bg-white p-5 sm:p-6" style={{ borderTop: `4px solid ${c}` }}>
                <h2 className="text-base font-bold">{k}</h2>
                {v ? <><p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap break-words">{v}</p>{k === 'To improve' && <AddNoteButton sessionId={s.id} sectionId={null} label="overall to improve note" />}</>
                  : <p className="mt-3 text-sm text-muted-foreground">Nothing noted.</p>}
              </section>
            ))}
          </div>
          <p className="mt-6 text-xs text-muted-foreground">Logged {new Date(s.created_at).toLocaleString()}</p>

          <AlertDialog open={open} onOpenChange={(o) => { if (!del.isPending) setOpen(o); }}>
            <AlertDialogContent className="rounded-xl" style={{ color: 'var(--navy)' }}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this session? This can't be undone.</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes the session from {fmtDate(s.session_date)}.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel data-testid="button-cancel-delete" className="ip-focus min-h-11 mt-0" disabled={del.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="button-confirm-delete" disabled={del.isPending}
                  onClick={(e) => { e.preventDefault(); confirmDelete(); }}
                  className="ip-focus min-h-11 text-white inline-flex items-center gap-2" style={{ background: 'var(--score-1)' }}>
                  {del.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{del.isPending ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </article>
      ) : null}
    </Shell>
  );
}

/* ---------------- Form ---------------- */

type FormVals = { scores?: ScoreDrafts; session_date: string; question_type_id: string; prompt: string; format: string; overall_score: string; duration_minutes: string; went_well: string; to_improve: string; story_id: string; case_book_id: string };
type Errs = Partial<Record<Exclude<keyof FormVals, 'scores'> | 'section_scores' | 'form', string>>;
const EMPTY: FormVals = { session_date: '', question_type_id: '', prompt: '', format: '', overall_score: '', duration_minutes: '', went_well: '', to_improve: '', story_id: '', case_book_id: '' };
const SAVE_ERROR = "Couldn't save your session. Please try again.";
const FIX_FIELDS = 'Please fix the highlighted fields.';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function realDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith('0000')) return false;
  const dt = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === v;
}

function validate(v: FormVals, typeIds: Set<number>): [Errs, SessionInput | null] {
  const e: Errs = {};
  const date = v.session_date.trim();
  if (!date || !realDate(date)) e.session_date = 'Please pick the date of your session.';
  else if (date > today()) e.session_date = "The date can't be in the future.";
  const qt = Number(v.question_type_id);
  if (!v.question_type_id || !typeIds.has(qt)) e.question_type_id = 'Please choose a question type.';
  const prompt = v.prompt.trim();
  if (!prompt) e.prompt = 'Please describe the case or question you practiced.';
  else if (prompt.length > 4000) e.prompt = 'Prompt must be 4000 characters or fewer.';
  if (!FORMATS.some(f => f.v === v.format)) e.format = 'Please choose solo, partner, or mock.';
  const sc = Number(v.overall_score);
  if (!v.overall_score || !Number.isInteger(sc) || sc < 1 || sc > 5) e.overall_score = 'Please give this session an overall score from 1 to 5.';
  const dur = v.duration_minutes.trim();
  let durN: number | null = null;
  if (dur) {
    if (!/^\d+$/.test(dur) || Number(dur) < 1 || Number(dur) > 600) e.duration_minutes = 'Duration should be a whole number of minutes, like 30.';
    else durN = Number(dur);
  }
  const ww = v.went_well.trim(), ti = v.to_improve.trim();
  if (ww.length > 4000) e.went_well = 'Must be 4000 characters or fewer.';
  if (ti.length > 4000) e.to_improve = 'Must be 4000 characters or fewer.';
  if (Object.keys(e).length) return [e, null];
  return [e, {
    session_date: date, question_type_id: qt, prompt, format: v.format as SessionInput['format'], overall_score: sc,
    duration_minutes: durN, went_well: ww || null, to_improve: ti || null,
  }];
}

function serverErrs(err: unknown): Errs {
  if (statusOf(err) === 400 && err && typeof err === 'object' && 'data' in err) {
    const data = err.data as { errors?: Record<string, unknown> } | null;
    const allowed = [...Object.keys(EMPTY), 'section_scores'];
    const errors = Object.fromEntries(Object.entries(data?.errors ?? {})
      .filter(([key, value]) => allowed.includes(key) && typeof value === 'string')) as Errs;
    if (Object.keys(errors).length) return errors;
  }
  return { form: SAVE_ERROR };
}

const inputCls = 'ip-focus block w-full min-h-11 rounded-lg border bg-white px-3.5 text-base transition-colors hover:border-[color:var(--navy)]';

function FieldWrap({ id, label, optional, error, hint, children }: { id: string; label: string; optional?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">{label}{optional && <span className="ml-1.5 font-normal text-muted-foreground">(optional)</span>}</label>
      {children}
      {error ? <ErrText id={`${id}-err`}>{error}</ErrText> : hint ? <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
const aria = (id: string, error?: string, hint?: boolean) => ({
  id, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
  style: { borderColor: error ? '#C0392B' : undefined },
});

function SessionForm({ initial, submitLabel, busy, onSubmit, cancelHref, serverErrors, defaultLatestBook }: {
  initial: FormVals; defaultLatestBook?: boolean; submitLabel: string; busy: boolean; cancelHref: string; serverErrors: Errs;
  onSubmit: (input: SessionInput) => void;
}) {
  const { user } = useAuth();
  const [v, setV] = useState<FormVals>(initial);
  const [errs, setErrs] = useState<Errs>({});
  const [kind, setKind] = useState<'case' | 'behavioral' | null>(null);
  const [drafts, setDrafts] = useState<ScoreDrafts>(initial.scores ?? {});
  const [addingType, setAddingType] = useState(false);
  const [addingBook, setAddingBook] = useState(false);
  const books = useCaseBooks();
  use401(books.error);
  // New form only: apply the most recent case book exactly once, and never after the user touched the field.
  const bookTouched = useRef(!defaultLatestBook);
  const latest = books.data?.most_recent_case_book_id;
  useEffect(() => {
    // Cached data can still describe the session before the last save. Wait
    // for the mount-time refetch before consuming this one-time default.
    if (bookTouched.current || latest === undefined || books.isFetching || books.error) return;
    bookTouched.current = true;
    if (latest !== null) setV(p => ({ ...p, case_book_id: String(latest) }));
  }, [latest, books.isFetching, books.error]);
  const sections = useCaseSections();
  use401(sections.error);
  const formRef = useRef<HTMLFormElement>(null);
  const focusErrors = useRef(false);
  useEffect(() => {
    if (Object.keys(serverErrors).length) {
      focusErrors.current = true;
      setErrs(serverErrors);
    }
  }, [serverErrors]);
  useEffect(() => {
    if (!focusErrors.current || !Object.keys(errs).length) return;
    focusErrors.current = false;
    const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not(fieldset)') ??
      formRef.current?.querySelector<HTMLElement>('[data-testid="status-form-error"]');
    target?.focus({ preventScroll: true });
    (target?.closest('label') ?? target)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [errs]);

  const types = useGetQuestionTypes({
    query: { queryKey: [...getGetQuestionTypesQueryKey(), user?.id], enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  use401(types.error);
  // Editing infers the initial kind from the saved type once reference data loads.
  const activeKind = kind ?? (types.data?.behavioral.some(t => String(t.id) === initial.question_type_id) ? 'behavioral' : 'case');
  const set = (k: Exclude<keyof FormVals, 'scores'>) => (val: string) => {
    const next = { ...v, [k]: val };
    setV(next);
    const [remaining] = validate(next, new Set((types.data?.[activeKind] ?? []).map(t => t.id)));
    setErrs(previous => {
      if (!previous[k] || remaining[k]) return previous;
      const updated = { ...previous };
      delete updated[k];
      return updated;
    });
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (addingType) { focusErrors.current = true; setErrs({ form: 'Save or cancel your new category before saving the session.' }); return; }
    if (addingBook && activeKind === 'case') { focusErrors.current = true; setErrs({ form: 'Save or cancel your new case book before saving the session.' }); return; }
    const ids = new Set((types.data?.[activeKind] ?? []).map(t => t.id));
    const [er, input] = validate(v, ids);
    if (!input) { focusErrors.current = true; setErrs(er); return; }
    if (activeKind === 'behavioral') { setErrs({}); onSubmit({ ...input, story_id: v.story_id ? Number(v.story_id) : null, case_book_id: null, section_scores: [] }); return; }
    // Never submit a case without the reference list; the scorecard shows a retry.
    const sc = sections.data ? draftsToInput(drafts, sections.data) : null;
    if (!sc) {
      focusErrors.current = true;
      setErrs(sections.data ? { section_scores: 'Please use 4,000 characters or fewer for section notes.' }
        : { form: 'Please load the case sections before saving.' });
      return;
    }
    setErrs({});
    onSubmit({ ...input, story_id: null, case_book_id: v.case_book_id ? Number(v.case_book_id) : null, section_scores: sc });
  }

  const counter = (s: string) => <span className="tabular-nums">{s.trim().length}/4000</span>;

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="ip-rise mt-6 rounded-xl p-5 sm:p-8 space-y-6" style={{ background: 'var(--panel)' }}>
      {Object.keys(errs).length > 0 && <div tabIndex={-1} className="rounded-lg bg-white border-l-4 p-3" style={{ borderColor: '#C0392B' }} data-testid="status-form-error"><ErrText>{Object.keys(errs).some(k => k !== 'form') ? FIX_FIELDS : errs.form}</ErrText></div>}

      <div role="radiogroup" aria-label="Practice kind" className="grid grid-cols-2 gap-2">
        {(['case', 'behavioral'] as const).map(k => (
          <button key={k} type="button" role="radio" aria-checked={activeKind === k}
            data-testid={`toggle-kind-${k}`} disabled={busy || !types.data}
            className="ip-focus min-h-11 rounded-lg border px-4 font-semibold disabled:opacity-60"
            style={{ background: activeKind === k ? 'var(--navy)' : 'white', color: activeKind === k ? 'white' : 'var(--navy)' }}
            onClick={() => {
              if (activeKind !== k) {
                setKind(k);
                bookTouched.current = true;
                setV(p => ({ ...p, question_type_id: '', story_id: '', case_book_id: '' }));
                setErrs(previous => {
                  const next = { ...previous };
                  delete next.section_scores;
                  return next;
                });
              }
            }}>{k === 'case' ? 'Case' : 'Behavioral'}</button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FieldWrap id="session_date" label="Session date" error={errs.session_date} hint="Format YYYY-MM-DD">
          <input {...aria('session_date', errs.session_date, true)} type="date" data-testid="input-session-date" className={inputCls}
            value={v.session_date} onChange={e => set('session_date')(e.target.value)} />
        </FieldWrap>
        <FieldWrap id="question_type_id" label="Question type" error={errs.question_type_id}>
          {types.isLoading ? <div className="ip-skel h-11 rounded-lg" aria-busy="true"><span className="sr-only">Loading question types</span></div>
            : types.error ? (
              <div className="space-y-2">
                <ErrText>Unable to load question types.</ErrText>
                <button type="button" onClick={() => void types.refetch()} disabled={types.isFetching} className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold">
                  {types.isFetching ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            ) : (
              <CategorySelect key={activeKind} id="question_type_id" testid="select-question-type" className={inputCls}
                invalid={!!errs.question_type_id} describedBy={errs.question_type_id ? 'question_type_id-err' : undefined}
                style={{ borderColor: errs.question_type_id ? '#C0392B' : undefined }}
                value={v.question_type_id} onChange={set('question_type_id')} placeholder="Choose a type"
                options={types.data?.[activeKind] ?? []} allowAdd={activeKind === 'behavioral'} disabled={busy} onAddingChange={setAddingType} />
            )}
        </FieldWrap>
      </div>

      {activeKind === 'case' && types.data && (
        <FieldWrap id="case_book_id" label="Case book" error={errs.case_book_id}>
          <CaseBookSelect id="case_book_id" className={inputCls} value={v.case_book_id} disabled={busy}
            invalid={!!errs.case_book_id} describedBy={errs.case_book_id ? 'case_book_id-err' : undefined}
            style={{ borderColor: errs.case_book_id ? '#C0392B' : undefined }}
            onChange={val => { bookTouched.current = true; set('case_book_id')(val); }} onAddingChange={setAddingBook} />
        </FieldWrap>
      )}

      {activeKind === 'behavioral' && types.data && (
        <StorySelect value={v.story_id} onChange={set('story_id')} typeId={v.question_type_id} disabled={busy} error={errs.story_id} />
      )}

      <FieldWrap id="prompt" label="Prompt" error={errs.prompt} hint="The case question or behavioral prompt you practiced.">
        <textarea {...aria('prompt', errs.prompt, true)} data-testid="input-prompt" rows={3} className={`${inputCls} py-2.5`}
           placeholder="Coffee chain profits down 15%" value={v.prompt} onChange={e => set('prompt')(e.target.value)} />
      </FieldWrap>

      <fieldset className="space-y-2" aria-describedby={errs.format ? 'format-err' : undefined}>
        <legend className="text-sm font-semibold">Format</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {FORMATS.map(f => {
            const on = v.format === f.v;
            return (
              <label key={f.v} className="min-h-11 flex items-center gap-2.5 rounded-lg border bg-white px-3.5 cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[color:var(--green)]"
                style={{ borderColor: errs.format ? '#C0392B' : on ? 'var(--navy)' : undefined, boxShadow: on ? 'inset 0 0 0 1px var(--navy)' : undefined }}>
                <input type="radio" name="format" value={f.v} checked={on} onChange={() => set('format')(f.v)} data-testid={`radio-format-${f.v}`}
                  aria-invalid={!!errs.format} aria-describedby={errs.format ? 'format-err' : undefined} className="h-4 w-4 accent-[color:var(--navy)]" />
                <span className="font-medium">{f.label}</span>
              </label>
            );
          })}
        </div>
        {errs.format && <ErrText id="format-err">{errs.format}</ErrText>}
      </fieldset>

      <fieldset className="space-y-2" aria-describedby={errs.overall_score ? 'score-err' : undefined}>
        <legend className="text-sm font-semibold">Overall score</legend>
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map(n => {
            const on = v.overall_score === String(n);
            return (
              <label key={n} className="min-h-14 flex flex-col items-center justify-center rounded-lg border bg-white cursor-pointer transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[color:var(--green)]"
                style={on ? { background: `var(--score-${n})`, borderColor: errs.overall_score ? '#C0392B' : `var(--score-${n})`, color: 'white' } : { borderColor: errs.overall_score ? '#C0392B' : undefined }}>
                <input type="radio" name="overall_score" value={n} checked={on} onChange={() => set('overall_score')(String(n))}
                  data-testid={`radio-score-${n}`} aria-invalid={!!errs.overall_score} aria-describedby={errs.overall_score ? 'score-err' : undefined} className="sr-only" aria-label={`${n}, ${SCORE_LABEL[n]}`} />
                <span className="text-lg font-bold tabular-nums leading-none">{n}</span>
                <span className="mt-1 text-[10px] sm:text-xs font-medium hidden min-[400px]:block opacity-80">{SCORE_LABEL[n]}</span>
              </label>
            );
          })}
        </div>
        {errs.overall_score && <ErrText id="score-err">{errs.overall_score}</ErrText>}
      </fieldset>

      {activeKind === 'case' && types.data && <ScorecardEditor drafts={drafts} onChange={d => {
        setDrafts(d);
        if (sections.data && draftsToInput(d, sections.data)) {
          setErrs(previous => { const next = { ...previous }; delete next.section_scores; return next; });
        }
      }} disabled={busy} query={sections} error={errs.section_scores} />}

      <FieldWrap id="duration_minutes" label="Duration in minutes" optional error={errs.duration_minutes} hint="Leave blank to clear.">
        <input {...aria('duration_minutes', errs.duration_minutes, true)} type="text" inputMode="numeric" data-testid="input-duration"
          className={`${inputCls} sm:max-w-[12rem]`} value={v.duration_minutes} onChange={e => set('duration_minutes')(e.target.value)} />
      </FieldWrap>

      <div className="grid gap-5 md:grid-cols-2">
        {(['went_well', 'to_improve'] as const).map(k => (
          <FieldWrap key={k} id={k} label={k === 'went_well' ? 'What went well' : 'What to improve'} optional error={errs[k]}>
            <textarea {...aria(k, errs[k])} data-testid={`input-${k.replace('_', '-')}`} rows={5} className={`${inputCls} py-2.5`}
              value={v[k]} onChange={e => set(k)(e.target.value)} />
            {!errs[k] && <p className="text-xs text-muted-foreground text-right">{counter(v[k])}</p>}
          </FieldWrap>
        ))}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
        <Link href={cancelHref} data-testid="link-cancel" className="ip-focus min-h-11 px-5 rounded-lg inline-flex items-center justify-center font-semibold border bg-white">Cancel</Link>
        <button type="submit" disabled={busy || addingType || (addingBook && activeKind === 'case')} data-testid="button-save-session"
          className="ip-focus min-h-11 px-6 rounded-lg font-semibold text-white inline-flex items-center justify-center gap-2 disabled:opacity-70 active:scale-[0.99] transition-transform"
          style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{busy ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function NewSessionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [srvErr, setSrvErr] = useState<Errs>({});
  const create = useCreateSession({ request: sessionRequestOptions() });
  use401(create.error);
  // "Practice this story" prefill: ?story=<id>. Strictly parsed, then validated against the real owned story.
  const search = useSearch();
  const rawStory = new URLSearchParams(search).get('story') ?? undefined;
  const storyId = useSessionId(rawStory);
  const story = useGetStory(storyId ?? 0, {
    query: { queryKey: storyDetailKey(storyId ?? 0, user?.id), enabled: !!user && storyId !== null, retry: false },
    request: sessionRequestOptions(),
  });
  use401(story.error);
  const types = useGetQuestionTypes({
    query: { queryKey: [...getGetQuestionTypesQueryKey(), user?.id], enabled: !!user && storyId !== null, retry: false },
    request: sessionRequestOptions(),
  });
  const sd = story.data;
  const prefillOk = !!sd && !!types.data?.behavioral.some(t => t.id === sd.competency_id);
  const initial = useMemo<FormVals>(() => ({
    ...EMPTY, session_date: today(),
    ...(prefillOk && sd ? { question_type_id: String(sd.competency_id), story_id: String(sd.id) } : {}),
  }), [prefillOk, sd]);
  const waiting = storyId !== null && (story.isLoading || (!!sd && types.isLoading));
  const prefillFailed = rawStory !== undefined && !waiting && !prefillOk;
  return (
    <Shell title="Log a session">
      <BackLink href={prefillOk && sd ? `/stories/${sd.id}` : '/sessions'}>{prefillOk ? 'Back to story' : 'All sessions'}</BackLink>
      <h1 className="ip-rise mt-3 text-3xl font-bold tracking-tight">Log a session</h1>
      {prefillOk && sd && <p className="mt-2 text-sm text-muted-foreground break-words" data-testid="text-practice-story">Practicing your story <span className="font-semibold" style={{ color: 'var(--navy)' }}>{sd.title}</span></p>}
      {prefillFailed && <div className="mt-4 rounded-lg border-l-4 bg-white p-3" style={{ borderColor: 'var(--score-3)' }} data-testid="status-prefill-missing"><ErrText>That story could not be loaded, so nothing was pre-filled.</ErrText></div>}
      {waiting ? (
        <div className="mt-6 space-y-4" aria-busy="true"><span className="sr-only" role="status">Loading story</span><div className="ip-skel h-96 rounded-xl" /></div>
      ) : (
      <SessionForm key={prefillOk ? `story-${sd?.id}` : 'blank'} defaultLatestBook initial={initial} submitLabel="Save session" busy={create.isPending} cancelHref={prefillOk && sd ? `/stories/${sd.id}` : '/sessions'} serverErrors={srvErr}
        onSubmit={(data) => create.mutate({ data }, {
          onSuccess: (s) => {
            qc.setQueryData(detailKey(s.id, user?.id), s);
            void invalidateLists(qc, user?.id);
            nav(`/sessions/${s.id}`);
          },
          onError: (e) => setSrvErr(serverErrs(e)),
        })} />
      )}
    </Shell>
  );
}

const toVals = (s: PracticeSessionDetail): FormVals => ({
  scores: draftsFrom(s.section_scores),
  session_date: s.session_date, question_type_id: String(s.question_type_id), prompt: s.prompt, format: s.format,
  overall_score: String(s.overall_score), duration_minutes: s.duration_minutes == null ? '' : String(s.duration_minutes),
  went_well: s.went_well ?? '', to_improve: s.to_improve ?? '',
  story_id: s.kind === 'behavioral' && s.story_id != null ? String(s.story_id) : '',
  case_book_id: s.kind === 'case' && s.case_book_id != null ? String(s.case_book_id) : '',
});

export function EditSessionPage({ rawId }: { rawId?: string }) {
  const id = useSessionId(rawId);
  const { user } = useAuth();
  const q = useSessionQuery(id);
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [srvErr, setSrvErr] = useState<Errs>({});
  const update = useUpdateSession({ request: sessionRequestOptions() });
  use401(update.error);
  // Snapshot initial values once per id so refetches don't clobber edits
  const snap = useRef<{ id: number; vals: FormVals } | null>(null);
  if (q.data && !q.isFetching && !q.error && id !== null && snap.current?.id !== id) {
    snap.current = { id, vals: toVals(q.data) };
  }

  return (
    <Shell title="Edit session">
      <BackLink href={id ? `/sessions/${id}` : '/sessions'}>Back to session</BackLink>
      {id === null || statusOf(q.error) === 404 ? <NotFoundPanel /> : q.isLoading || (!snap.current && !q.error) ? (
        <div className="mt-6 space-y-4" aria-busy="true"><span className="sr-only" role="status">Loading session</span>
          <div className="ip-skel h-8 w-48 rounded" /><div className="ip-skel h-96 rounded-xl" />
        </div>
      ) : q.error && !snap.current ? (
        <ErrorPanel msg="Unable to load this session. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : snap.current ? (
        <>
          <h1 className="ip-rise mt-3 text-3xl font-bold tracking-tight">Edit session</h1>
          <SessionForm key={id} initial={snap.current.vals} submitLabel="Save changes" busy={update.isPending} cancelHref={`/sessions/${id}`} serverErrors={srvErr}
            onSubmit={(data) => update.mutate({ id, data }, {
              onSuccess: (s) => {
                qc.setQueryData(detailKey(s.id, user?.id), s);
                void invalidateLists(qc, user?.id);
                snap.current = null;
                nav(`/sessions/${s.id}`);
              },
              onError: (e) => {
                setSrvErr(serverErrs(e));
              },
            })} />
        </>
      ) : null}
    </Shell>
  );
}
