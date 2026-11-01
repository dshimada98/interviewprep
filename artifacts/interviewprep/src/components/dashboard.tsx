import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { AlertCircle, Plus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { useGetDashboard, type DashboardSummary } from '@workspace/api-client-react';
import { useAuth, sessionRequestOptions } from '@/auth';
import { AppHeader } from './ip';
import { PracticeAreas } from './practice-areas';
import { NextCaseFocus } from './next-case-focus';
import { ChecklistCard } from './checklist';
import { ByCaseBook } from './case-book-panel';
import { ExportButton } from './export-button';
import { dashboardKey, statusOf } from './session-keys';

/** Band thresholds match the scorecard scale: below 3 red (1-2), 3 to below 4 amber (3), 4+ green (4-5). */
function bandColor(v: number) {
  return v < 3 ? 'var(--score-1)' : v < 4 ? 'var(--score-3)' : 'var(--score-5)';
}
const fmt = (v: number) => v.toFixed(1);
const NA_BG = '#E6E9EE';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return { short: `${MONTHS[m - 1]} ${day}`, long: `${MONTHS[m - 1]} ${day}, ${y}` };
}

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

function SectionChart({ d }: { d: DashboardSummary }) {
  const rows = [...d.section_averages].sort((a, b) => a.display_order - b.display_order);
  const data = rows.map(r => ({ name: r.name, value: r.average_score ?? 0, avg: r.average_score }));
  const unscored = rows.filter(r => r.average_score === null);
  return (
    <Panel title="Average score by section" id="h-chart">
      {rows.every(r => r.average_score === null) ? (
        <p className="text-sm text-muted-foreground" data-testid="text-chart-empty">No section scores yet. Score sections on a case session to fill this chart.</p>
      ) : (
        <div aria-hidden className="h-[300px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }}>
              <CartesianGrid horizontal={false} stroke="#D5DAE1" />
              <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: '#5B6577' }} />
              <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12, fill: '#1F2A44' }} interval={0} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={18}>
                {data.map(r => <Cell key={r.name} fill={r.avg === null ? 'transparent' : bandColor(r.avg)} />)}
                <LabelList dataKey="avg" position="right" formatter={(v: unknown) => (typeof v === 'number' ? fmt(v) : '')}
                  style={{ fontSize: 12, fontWeight: 700, fill: '#1F2A44' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <ul className="sr-only" data-testid="list-section-averages">
        {rows.map(r => <li key={r.id}>{r.name}: {r.average_score === null ? 'not scored yet' : `average ${fmt(r.average_score)} out of 5, scored ${r.scored_count} ${r.scored_count === 1 ? 'time' : 'times'}`}</li>)}
      </ul>
      {unscored.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground" data-testid="text-unscored-sections">
          {unscored.map(r => r.name).join(', ')}: not scored yet
        </p>
      )}
    </Panel>
  );
}

function Legend() {
  const items = [['1-2', 'var(--score-1)'], ['3', 'var(--score-3)'], ['4-5', 'var(--score-5)'], ['N/A', NA_BG]];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium" aria-label="Score color legend">
      {items.map(([l, c]) => <li key={l} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: c }} />{l}</li>)}
    </ul>
  );
}

function Heatmap({ d }: { d: DashboardSummary }) {
  const rows = [...d.section_averages].sort((a, b) => a.display_order - b.display_order);
  const cols = d.heatmap;
  return (
    <Panel title="Section heatmap" id="h-heatmap">
      {cols.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-heatmap-empty">Log a case session to start the heatmap.</p>
      ) : (
        <>
          <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-lg bg-white"
            style={{ contain: 'inline-size layout paint' }} data-testid="scroll-heatmap">
            <table className="border-separate border-spacing-1 text-sm">
              <caption className="sr-only">Section scores for your {cols.length} most recent case sessions, oldest first. Blank cells are N/A.</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-white text-left px-2 font-semibold text-xs text-muted-foreground">Section</th>
                  {cols.map(c => {
                    const dt = shortDate(c.session_date);
                    return (
                      <th key={c.id} scope="col" className="px-0 font-semibold">
                        <Link href={`/sessions/${c.id}`} title={`${dt.long}: ${c.prompt}`} aria-label={`${dt.long}: ${c.prompt}`}
                          data-testid={`link-heatmap-session-${c.id}`}
                          className="ip-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 text-xs whitespace-nowrap underline underline-offset-2 decoration-[color:var(--green)] hover:bg-[color:var(--panel)]">
                          {dt.short}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <th scope="row" className="sticky left-0 z-10 bg-white text-left font-medium px-2 whitespace-nowrap max-w-[9rem] truncate" title={r.name}>{r.name}</th>
                    {cols.map(c => {
                      const s = c.sections.find(x => x.section_id === r.id)?.score ?? null;
                      return (
                        <td key={c.id} data-testid={`cell-heatmap-${c.id}-${r.id}`}
                          className="h-11 min-w-11 w-11 rounded text-center font-bold tabular-nums text-white"
                          style={{ background: s === null ? NA_BG : bandColor(s) }}>
                          {s === null ? <span className="sr-only">N/A</span> : s}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
        </>
      )}
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
  const q = useGetDashboard({
    query: { queryKey: dashboardKey(user?.id), enabled: !!user, staleTime: 30_000, refetchOnMount: 'always', retry: false },
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
      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-12 overflow-x-clip" style={{ color: 'var(--navy)' }}>
        <p className="ip-rise text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Overview</p>
        <div className="mt-2 mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="ip-rise text-3xl sm:text-4xl font-bold tracking-tight">Dashboard</h1>
          <ExportButton />
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionChart d={d} />
              <Heatmap d={d} />
            </div>
          </div>
        ) : null}

        <PracticeAreas />
      </main>
    </div>
  );
}
