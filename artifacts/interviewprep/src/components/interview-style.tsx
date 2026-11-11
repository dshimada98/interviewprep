import type { CaseStyle, DashboardSummary } from '@workspace/api-client-react';

export type StyleValue = Exclude<CaseStyle, null>;
export const STYLES: { v: StyleValue; label: string }[] = [
  { v: 'interviewer_led', label: 'Interviewer-led' },
  { v: 'candidate_led', label: 'Candidate-led' },
  { v: 'not_sure', label: 'Not sure' },
];
export const styleLabel = (s: string | null | undefined) => STYLES.find(x => x.v === s)?.label ?? null;
export const isStyle = (s: unknown): s is StyleValue => STYLES.some(x => x.v === s);

export function StyleChip({ style, testid }: { style: string | null | undefined; testid: string }) {
  const label = styleLabel(style);
  if (!label) return null;
  return (
    <span data-testid={testid} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{ borderColor: 'var(--navy)', color: 'var(--navy)', background: 'white' }}>
      {label}
    </span>
  );
}

export function StylePicker({ value, onChange, disabled, error }: { value: string; onChange: (v: string) => void; disabled?: boolean; error?: string }) {
  return (
    <fieldset className="space-y-2" aria-describedby={error ? 'case_style-err' : undefined}>
      <legend className="text-sm font-semibold">Interview style<span className="ml-1.5 font-normal text-muted-foreground">(optional)</span></legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {STYLES.map(s => {
          const on = value === s.v;
          return (
            <button key={s.v} type="button" aria-pressed={on} disabled={disabled} data-testid={`toggle-style-${s.v}`}
              aria-invalid={!!error}
              onClick={() => onChange(on ? '' : s.v)}
              className="ip-focus min-h-11 rounded-lg border px-3.5 font-semibold transition-colors disabled:opacity-60"
              style={{ background: on ? 'var(--navy)' : 'white', color: on ? 'white' : 'var(--navy)', borderColor: error ? '#C0392B' : on ? 'var(--navy)' : undefined }}>
              {s.label}
            </button>
          );
        })}
      </div>
      {error && <p id="case_style-err" role="alert" className="text-sm font-medium" style={{ color: '#C0392B' }}>{error}</p>}
    </fieldset>
  );
}

export function ByInterviewStyle({ d, scoreColor }: { d: DashboardSummary; scoreColor: (v: number) => string }) {
  const rows = d.by_case_style ?? [];
  if (d.total_cases === 0 || rows.length === 0) return null;
  return (
    <section aria-labelledby="h-by-style" className="min-w-0 rounded-xl p-5 sm:p-6" style={{ background: 'var(--panel)' }} data-testid="panel-by-case-style">
      <h2 id="h-by-style" className="text-lg font-bold tracking-tight">By interview style</h2>
      <div className="mt-1 mb-4 h-0.5 w-10 rounded" style={{ background: 'var(--green)' }} />
      <ul className="divide-y divide-white">
        {rows.map(r => {
          const k = r.case_style ?? 'not_set';
          return (
            <li key={k} data-testid={`row-case-style-${k}`} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1 font-semibold break-words">{r.name}</span>
              <span className="flex flex-wrap items-center gap-3 text-sm">
                <span className="tabular-nums" data-testid={`text-case-style-count-${k}`}><span className="font-bold">{r.count}</span> {r.count === 1 ? 'case' : 'cases'}</span>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums text-white" style={{ background: scoreColor(r.average_score) }}
                  aria-label={`Average ${r.average_score.toFixed(1)} out of 5`} data-testid={`badge-case-style-avg-${k}`}>{r.average_score.toFixed(1)}</span>
                {r.weakest_section && <span className="text-muted-foreground" data-testid={`text-case-style-weakest-${k}`}>weakest: {r.weakest_section}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
