import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { AlertCircle, Plus } from 'lucide-react';
import { useGetDashboard, type DashboardSummary } from '@workspace/api-client-react';
import { useAuth, sessionRequestOptions } from '@/auth';
import { AppHeader } from './ip';
import { PracticeAreas } from './practice-areas';
import { NextCaseFocus } from './next-case-focus';
import { ChecklistCard } from './checklist';
import { ByCaseBook } from './case-book-panel';
import { ByInterviewStyle } from './interview-style';
import { ExportButton } from './export-button';
import { dashboardKey, statusOf } from './session-keys';
import { SectionProgressCard } from './section-progress';
import { useSectionProgressUrl } from './section-progress-utils';

/** Band thresholds match the scorecard scale: below 3 red (1-2), 3 to below 4 amber (3), 4+ green (4-5). */
function bandColor(v: number) {
  return v < 3 ? 'var(--score-1)' : v < 4 ? 'var(--score-3)' : 'var(--score-5)';
}
const fmt = (v: number) => v.toFixed(1);
function Panel({ title, children, id, className = '' }: { title: string; children: React.ReactNode; id: string; className?: string }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 rounded-xl p-5 sm:p-6 ${className}`} style={{ background: 'var(--panel)' }}>
      <h2 id={id} className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-1 mb-4 h-0.5 w-10 rounded" style={{ background: 'var(--green)' }} />
      {children}
    </section>
  );
}

function Stat({ label, testid, children, sub }: { label: string; testid: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl p-4 sm:p-5 bg-white border-t-4" style={{ borderColor: 'var(--navy)' }}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight tabular-nums break-words" data-testid={testid}>{children}</div>
      {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Stats({ d }: { d: DashboardSummary }) {
  const w = d.weakest_case_type;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      <Stat label="Cases logged" testid="stat-total-cases">{d.total_cases}</Stat>
      <Stat label="Average case score" testid="stat-average-case-score">
        {d.average_case_score === null
          ? <span className="text-xl font-semibold text-muted-foreground">No cases yet</span>
          : <span style={{ color: bandColor(d.average_case_score) }}>{fmt(d.average_case_score)}</span>}
      </Stat>
      <Stat label="Weakest case type" testid="stat-weakest-type"
        sub={w ? <span>Average <span className="font-bold tabular-nums" style={{ color: bandColor(w.average_score) }}>{fmt(w.average_score)}</span></span> : undefined}>
        {w ? <span className="block text-xl sm:text-2xl leading-tight">{w.name}</span>
          : <span className="block text-sm font-medium leading-snug text-muted-foreground">Log 2+ cases of one type to see this</span>}
      </Stat>
      <Stat label="Behavioral sessions" testid="stat-behavioral-sessions">{d.behavioral_sessions}</Stat>
    </div>
  );
}

function CasesByType({ d }: { d: DashboardSummary }) {
  return (
    <Panel title="Cases by type" id="h-by-type">
      <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1">
        {d.cases_by_type.map(t => (
          <li key={t.id} data-testid={`row-case-type-${t.id}`} className={`flex items-center justify-between gap-3 py-1.5 border-b border-white ${t.count === 0 ? 'text-muted-foreground' : ''}`}>
            <span className="truncate">{t.name}</span>
            <span className={`tabular-nums ${t.count ? 'font-bold' : ''}`}>{t.count}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading your dashboard</span>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">{[0, 1, 2, 3].map(i => <div key={i} className="ip-skel h-28 rounded-xl" />)}</div>
      <div className="ip-skel h-32 rounded-xl" />
      <div className="grid lg:grid-cols-2 gap-5"><div className="ip-skel h-80 rounded-xl" /><div className="ip-skel h-80 rounded-xl" /></div>
    </div>
  );
}

export function DashboardPage() {
  const { user, refresh } = useAuth();
  const sp = useSectionProgressUrl();
  const range = sp.state.range;
  const q = useGetDashboard({ range }, {
    query: { queryKey: dashboardKey(user?.id, range), placeholderData: (prev, previousQuery) => previousQuery?.queryKey[1] === user?.id ? prev : undefined, enabled: !!user, staleTime: 30_000, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  const [retrying, setRetrying] = useState(false);
  useEffect(() => { document.title = 'Dashboard | InterviewPrep'; }, []);
  useEffect(() => { if (statusOf(q.error) === 401) void refresh(); }, [q.error, refresh]);
  const d = q.data;
  const empty = d && d.total_cases === 0 && d.behavioral_sessions === 0;

  return (
    <div className="min-h-[100dvh]">
      <AppHeader />
      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12" style={{ color: 'var(--navy)' }}>
        <p className="ip-rise text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Overview</p>
        <div className="mt-2 mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="ip-rise text-3xl sm:text-4xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
            <Link href="/sessions/new" data-testid="link-dashboard-log-session"
              className="ip-focus min-h-11 w-full sm:w-auto px-5 rounded-lg inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold text-white"
              style={{ background: '#2E9E6B', color: '#FFFFFF' }}>
              + Log session
            </Link>
            <ExportButton />
          </div>
        </div>

        {d && <div className="mb-5"><NextCaseFocus focus={d.next_case_focus} scoreColor={bandColor} /></div>}
        {(d || !q.isLoading) && <div className="mb-5"><ChecklistCard /></div>}
        {q.isLoading ? <Skeleton /> : q.isError && !d ? (
          <div className="rounded-xl border-l-4 bg-white p-5 space-y-3" style={{ borderColor: 'var(--score-1)' }} data-testid="status-dashboard-error">
            <p role="alert" className="flex items-start gap-2 font-medium" style={{ color: 'var(--score-1)' }}>
              <AlertCircle className="h-4 w-4 mt-1 shrink-0" aria-hidden />Unable to load your dashboard. Please try again.
            </p>
            <button data-testid="button-retry-dashboard" disabled={retrying}
              onClick={async () => { setRetrying(true); await q.refetch(); setRetrying(false); }}
              className="ip-focus min-h-11 px-5 rounded-lg font-semibold text-white disabled:opacity-60" style={{ background: 'var(--navy)' }}>
              {retrying ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ) : empty ? (
          <div className="ip-rise rounded-xl p-8 sm:p-12 border-l-4 text-center sm:text-left" style={{ background: 'var(--panel)', borderColor: 'var(--green)' }} data-testid="status-dashboard-empty">
            <p className="text-xl sm:text-2xl font-bold tracking-tight">Your dashboard fills in as you log sessions.</p>
            <Link href="/sessions/new" data-testid="link-log-first-session"
              className="ip-focus mt-6 min-h-11 px-5 rounded-lg inline-flex items-center justify-center gap-2 font-semibold text-white"
              style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
              <Plus className="h-4 w-4" aria-hidden />Log your first session
            </Link>
          </div>
        ) : d ? (
          <div className="space-y-5">
            <Stats d={d} />
            <CasesByType d={d} />
            <ByCaseBook d={d} scoreColor={bandColor} />
            <ByInterviewStyle d={d} scoreColor={bandColor} />
          </div>
        ) : null}

        {d && <div className="mt-5"><SectionProgressCard d={d.section_progress} st={sp.state} set={sp.set} loading={q.isPlaceholderData} /></div>}
        <PracticeAreas />
      </main>
    </div>
  );
}
