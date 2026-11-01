import { AlertCircle, ChevronDown, Plus } from 'lucide-react';
import {
  getGetCaseSectionsQueryKey, useGetCaseSections,
  type CaseSection, type SectionScore, type SectionScoreInput,
} from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';

export type ScoreDraft = { score: number | null; went_well: string; to_improve: string; open: boolean };
export type ScoreDrafts = Record<number, ScoreDraft>;

const LABEL = ['', 'Struggled', 'Shaky', 'Solid', 'Strong', 'Excellent'];
const BLANK: ScoreDraft = { score: null, went_well: '', to_improve: '', open: false };

export function useCaseSections(enabled = true) {
  const { user } = useAuth();
  return useGetCaseSections({
    query: { queryKey: [...getGetCaseSectionsQueryKey(), user?.id], enabled: !!user && enabled, retry: false },
    request: sessionRequestOptions(),
  });
}

export function draftsFrom(scores: SectionScore[] | undefined): ScoreDrafts {
  const out: ScoreDrafts = {};
  for (const s of scores ?? []) {
    const ww = s.went_well ?? '', ti = s.to_improve ?? '';
    out[s.section_id] = { score: s.score, went_well: ww, to_improve: ti, open: !!(ww || ti) };
  }
  return out;
}

/** Returns null if any note is too long. N/A sections are omitted entirely, even with notes. */
export function draftsToInput(d: ScoreDrafts, sections: CaseSection[]): SectionScoreInput[] | null {
  const out: SectionScoreInput[] = [];
  for (const sec of sections) {
    const x = d[sec.id];
    if (!x || x.score == null) continue;
    const ww = x.went_well.trim(), ti = x.to_improve.trim();
    if (ww.length > 4000 || ti.length > 4000) return null;
    out.push({ section_id: sec.id, score: x.score, went_well: ww || null, to_improve: ti || null });
  }
  return out;
}

const sorted = (s: CaseSection[] | undefined) => [...(s ?? [])].sort((a, b) => a.display_order - b.display_order);

function RetryBox({ msg, busy, onRetry }: { msg: string; busy: boolean; onRetry: () => void }) {
  return (
    <div className="rounded-lg border-l-4 bg-white p-4 space-y-3" style={{ borderColor: 'var(--score-1)' }} data-testid="status-sections-error">
      <p role="alert" className="flex items-start gap-2 text-sm font-medium" style={{ color: 'var(--score-1)' }}>
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />{msg}
      </p>
      <button type="button" data-testid="button-retry-sections" onClick={onRetry} disabled={busy}
        className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold disabled:opacity-60">{busy ? 'Retrying...' : 'Retry'}</button>
    </div>
  );
}

export function ScorecardEditor({ drafts, onChange, disabled, query }: {
  drafts: ScoreDrafts; onChange: (d: ScoreDrafts) => void; disabled?: boolean;
  query: ReturnType<typeof useCaseSections>;
}) {
  const sections = sorted(query.data);
  const patch = (id: number, p: Partial<ScoreDraft>) => onChange({ ...drafts, [id]: { ...(drafts[id] ?? BLANK), ...p } });
  return (
    <fieldset className="space-y-3" data-testid="section-scorecard">
      <legend className="text-sm font-semibold">Scorecard<span className="ml-1.5 font-normal text-muted-foreground">(rate each section, or leave N/A)</span></legend>
      {query.isLoading ? (
        <div className="space-y-2" aria-busy="true"><span className="sr-only" role="status">Loading case sections</span>
          {[0, 1, 2, 3].map(i => <div key={i} className="ip-skel h-16 rounded-lg" />)}
        </div>
      ) : query.error || !query.data ? (
        <RetryBox msg="Unable to load case sections. Retry before saving." busy={query.isFetching} onRetry={() => void query.refetch()} />
      ) : (
        <ol className="rounded-xl border bg-white divide-y overflow-hidden">
          {sections.map(sec => {
            const d = drafts[sec.id] ?? BLANK;
            return (
               <li key={sec.id} className="p-1.5 sm:p-4" data-testid={`row-section-${sec.id}`}
                style={{ borderLeft: `4px solid ${d.score ? `var(--score-${d.score})` : 'hsl(var(--border))'}` }}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4">
                  <div className="flex items-center justify-between gap-2 lg:w-52 lg:shrink-0">
                    <span className="font-semibold text-sm">{sec.name}</span>
                    <button type="button" data-testid={`button-notes-${sec.id}`} aria-expanded={d.open} disabled={disabled}
                      onClick={() => patch(sec.id, { open: !d.open })}
                      className="ip-focus lg:hidden min-h-11 px-2 inline-flex items-center gap-1 text-xs font-semibold rounded hover:underline underline-offset-4">
                      {d.open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}{d.open ? 'Hide notes' : 'Add notes'}
                    </button>
                  </div>
                  <div role="radiogroup" aria-label={`${sec.name} score`} className="grid grid-cols-3 min-[375px]:grid-cols-6 gap-0.5 sm:gap-1.5 min-w-0 flex-1 lg:max-w-md">
                    {[1, 2, 3, 4, 5, null].map(n => {
                      const on = d.score === n;
                      return (
                        <button key={n ?? 'na'} type="button" role="radio" aria-checked={on} disabled={disabled}
                          aria-label={n ? `${n}, ${LABEL[n]}` : 'Not applicable'} data-testid={`radio-section-${sec.id}-${n ?? 'na'}`}
                          onClick={() => patch(sec.id, { score: n })}
                          className="ip-focus min-h-11 min-w-11 rounded-lg border text-sm font-bold tabular-nums transition-colors disabled:opacity-60"
                          style={on ? (n ? { background: `var(--score-${n})`, borderColor: `var(--score-${n})`, color: 'white' }
                            : { background: 'hsl(var(--muted))', borderColor: 'var(--navy)', color: 'var(--navy)' }) : { background: 'white' }}>
                          {n ?? 'N/A'}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" aria-expanded={d.open} disabled={disabled} onClick={() => patch(sec.id, { open: !d.open })}
                    className="ip-focus hidden lg:inline-flex min-h-11 px-2 items-center gap-1 text-xs font-semibold rounded hover:underline underline-offset-4 ml-auto">
                    {d.open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}{d.open ? 'Hide notes' : 'Add notes'}
                  </button>
                </div>
                {d.open && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(['went_well', 'to_improve'] as const).map(k => (
                      <label key={k} className="block space-y-1">
                        <span className="text-xs font-semibold">{k === 'went_well' ? 'What went well' : 'What to improve'}</span>
                        <textarea rows={3} disabled={disabled} value={d[k]} data-testid={`input-section-${sec.id}-${k.replace('_', '-')}`}
                          onChange={e => patch(sec.id, { [k]: e.target.value })}
                          className="ip-focus block w-full min-h-11 rounded-lg border bg-white px-3 py-2 text-base hover:border-[color:var(--navy)]" />
                        <span className="block text-right text-xs text-muted-foreground tabular-nums">{d[k].trim().length}/4000</span>
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </fieldset>
  );
}

function Badge({ score }: { score: number | null }) {
  return score ? (
    <span className="inline-flex min-w-11 justify-center rounded-full px-2.5 py-1 text-sm font-bold tabular-nums text-white" style={{ background: `var(--score-${score})` }}
      aria-label={`${score} of 5, ${LABEL[score]}`}>{score}</span>
  ) : (
    <span className="inline-flex min-w-11 justify-center rounded-full px-2.5 py-1 text-sm font-semibold text-muted-foreground" style={{ background: 'hsl(var(--muted))' }}>N/A</span>
  );
}

const Note = ({ v }: { v: string | null | undefined }) =>
  v ? <span className="whitespace-pre-wrap break-words">{v}</span> : <span className="text-muted-foreground">-</span>;

export function ScorecardView({ scores }: { scores: SectionScore[] }) {
  const q = useCaseSections();
  const byId = new Map(scores.map(s => [s.section_id, s]));
  const rows: { id: number; name: string; s?: SectionScore }[] = q.data
    ? sorted(q.data).map(sec => ({ id: sec.id, name: sec.name, s: byId.get(sec.id) }))
    : [...scores].sort((a, b) => a.display_order - b.display_order).map(s => ({ id: s.section_id, name: s.section_name, s }));
  return (
    <section className="ip-rise mt-6 rounded-xl border bg-white p-4 sm:p-6" style={{ animationDelay: '100ms' }} data-testid="section-scorecard-view">
      <h2 className="text-base font-bold">Scorecard</h2>
      {q.isLoading && !scores.length ? <div className="ip-skel mt-4 h-40 rounded-lg" aria-busy="true" />
        : q.error && <div className="mt-3"><RetryBox msg="Unable to load all case sections." busy={q.isFetching} onRetry={() => void q.refetch()} /></div>}
      {rows.length > 0 && (
        <>
          <table className="hidden md:table mt-4 w-full text-sm table-fixed">
            <thead><tr className="text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="py-2 pr-3 w-44">Section</th><th className="py-2 pr-3 w-20">Score</th><th className="py-2 pr-3">What went well</th><th className="py-2">What to improve</th>
            </tr></thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.id} data-testid={`row-scorecard-${r.id}`} className="align-top">
                  <td className="py-3 pr-3 font-semibold">{r.name}</td>
                  <td className="py-3 pr-3"><Badge score={r.s?.score ?? null} /></td>
                  <td className="py-3 pr-3"><Note v={r.s?.went_well} /></td>
                  <td className="py-3"><Note v={r.s?.to_improve} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden mt-4 space-y-2">
            {rows.map(r => (
              <li key={r.id} data-testid={`card-scorecard-${r.id}`} className="rounded-lg border p-3 text-sm"
                style={{ borderLeft: `4px solid ${r.s ? `var(--score-${r.s.score})` : 'hsl(var(--border))'}` }}>
                <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.name}</span><Badge score={r.s?.score ?? null} /></div>
                {r.s && (r.s.went_well || r.s.to_improve) && (
                  <dl className="mt-2 space-y-2">
                    <div><dt className="text-xs font-semibold text-muted-foreground">What went well</dt><dd><Note v={r.s.went_well} /></dd></div>
                    <div><dt className="text-xs font-semibold text-muted-foreground">What to improve</dt><dd><Note v={r.s.to_improve} /></dd></div>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
