import type { DashboardSummary } from '@workspace/api-client-react';
import { caseBookLabel } from './case-book-label';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Date-only string, parsed by parts so no timezone shift can move the day. */
function shortDay(d: string) {
  const [, m, day] = d.split('-').map(Number);
  return m >= 1 && m <= 12 && day ? `${MONTHS[m - 1]} ${day}` : d;
}

export function ByCaseBook({ d, scoreColor }: { d: DashboardSummary; scoreColor: (v: number) => string }) {
  const rows = d.by_case_book ?? [];
  if (d.total_cases === 0 || rows.length === 0) return null;
  return (
    <section aria-labelledby="h-by-book" className="min-w-0 rounded-xl p-5 sm:p-6" style={{ background: 'var(--panel)' }} data-testid="panel-by-case-book">
      <h2 id="h-by-book" className="text-lg font-bold tracking-tight">By case book</h2>
      <div className="mt-1 mb-4 h-0.5 w-10 rounded" style={{ background: 'var(--green)' }} />
      <ul className="divide-y divide-white">
        {rows.map(r => {
          const k = r.case_book_id ?? 'none';
          return (
            <li key={k} data-testid={`row-case-book-${k}`} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1 font-semibold break-words">{caseBookLabel(r.name, r.publication_year)}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="tabular-nums" data-testid={`text-case-book-count-${k}`}><span className="font-bold">{r.count}</span> {r.count === 1 ? 'case' : 'cases'}</span>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums text-white" style={{ background: scoreColor(r.average_score) }}
                  aria-label={`Average ${r.average_score.toFixed(1)} out of 5`} data-testid={`badge-case-book-avg-${k}`}>{r.average_score.toFixed(1)}</span>
                <span className="text-muted-foreground" data-testid={`text-case-book-last-${k}`}>last practiced {shortDay(r.last_practiced)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
