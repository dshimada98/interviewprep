import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { SectionProgress, SectionProgressSection } from '@workspace/api-client-react';
import {
  SP_COLORS, SP_DOWN, SP_NA, SP_UP, calDate, fmt1, scoreColors, sortByChange, subtitle, trailing3,
  type SPState,
} from './section-progress-utils';

type Opt<T extends string> = { v: T; label: string };
function Seg<T extends string>({ label, value, options, onChange, testid }: { label: string; value: T; options: Opt<T>[]; onChange: (v: T) => void; testid: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border bg-white p-0.5 shrink-0">
      {options.map(o => {
        const on = o.v === value;
        return (
          <button key={o.v} type="button" role="radio" aria-checked={on} data-testid={`${testid}-${o.v}`} onClick={() => onChange(o.v)}
            className="ip-focus min-h-11 flex-1 rounded-md px-3 text-sm font-semibold whitespace-nowrap transition-colors"
            style={on ? { background: 'var(--navy)', color: 'white' } : { color: 'var(--navy)' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Badge({ v, digits = true, className = '' }: { v: number | null; digits?: boolean; className?: string }) {
  const [bg, fg] = scoreColors(v);
  return <span className={`inline-flex items-center justify-center rounded-md px-1.5 font-bold tabular-nums ${className}`} style={{ background: bg, color: fg }}>
    {v === null ? '–' : digits ? fmt1(v) : v}
  </span>;
}

function ChangePill({ c, testid }: { c: number | null; testid: string }) {
  const [bg, fg] = c === null || c === 0 ? SP_NA : c > 0 ? SP_UP : SP_DOWN;
  return (
    <span data-testid={testid} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
      {c === null ? 'Need more cases' : c === 0 ? 'No change' : <>{c > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}{c > 0 ? '+' : ''}{fmt1(c)}</>}
    </span>
  );
}

/* ---------------- Sparkline ---------------- */
type Pt = { x: number; v: number | null; big?: boolean; label: string };
const W = 220, H = 70, PX = 8, PY = 8;
function Spark({ pts, rolling, shadeFrom, name }: { pts: Pt[]; rolling?: (number | null)[]; shadeFrom?: number; name: string }) {
  const [tip, setTip] = useState<number | null>(null);
  const n = pts.length;
  const xOf = (i: number) => (n <= 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (n - 1));
  const yOf = (v: number) => PY + ((5 - v) * (H - 2 * PY)) / 4;
  const step = n <= 1 ? W : (W - 2 * PX) / (n - 1);
  const segs = (vals: (number | null)[]) => {
    const out: string[] = []; let cur = '';
    vals.forEach((v, i) => {
      if (v === null) { if (cur) out.push(cur); cur = ''; return; }
      cur += `${cur ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
    });
    if (cur) out.push(cur);
    return out;
  };
  const t = tip !== null ? pts[tip] : null;
  return (
    <div className="relative mt-3" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto overflow-visible" role="group" aria-label={`${name} sparkline`}>
        {shadeFrom !== undefined && shadeFrom >= 0 && (
          <rect x={Math.max(0, xOf(shadeFrom) - step / 2)} y={0} width={W - Math.max(0, xOf(shadeFrom) - step / 2)} height={H} fill="#1F2A44" opacity={0.06} rx={4} />
        )}
        {[1, 3, 5].map(g => <line key={g} x1={0} x2={W} y1={yOf(g)} y2={yOf(g)} stroke="#1F2A44" strokeOpacity={0.1} strokeDasharray={g === 3 ? '0' : '2 3'} />)}
        {rolling ? segs(rolling).map((d, i) => <path key={i} d={d} fill="none" stroke="#8A93A3" strokeWidth={1.5} />)
          : segs(pts.map(p => p.v)).map((d, i) => <path key={i} d={d} fill="none" stroke="#8A93A3" strokeWidth={1.25} />)}
        {pts.map((p, i) => p.v === null ? null : (
          <circle key={i} cx={xOf(i)} cy={yOf(p.v)} r={p.big === false ? 3 : 4.5} fill={scoreColors(p.v)[0]}
            stroke={tip === i ? '#1F2A44' : scoreColors(p.v)[1]} strokeWidth={tip === i ? 2 : 1}
            tabIndex={0} role="img" aria-label={`${p.label}, score ${fmt1(p.v)}`} className="cursor-pointer outline-none"
            onMouseEnter={() => setTip(i)} onFocus={() => setTip(i)} onBlur={() => setTip(null)} onClick={() => setTip(i)}
            onKeyDown={e => { if (e.key === 'Escape') setTip(null); }} />
        ))}
      </svg>
      {t && t.v !== null && (
        <div role="tooltip" className="pointer-events-none absolute z-20 bottom-full mb-1 w-max max-w-[200px] break-words -translate-x-1/2 rounded-md px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${Math.min(80, Math.max(20, (xOf(tip as number) / W) * 100))}%`, background: 'var(--navy)', color: 'white' }}>
          <span className="font-bold tabular-nums">{fmt1(t.v)}</span> · {t.label}
        </div>
      )}
    </div>
  );
}

/* ---------------- Trends ---------------- */
function Trends({ d, st }: { d: SectionProgress; st: SPState }) {
  const sorted = sortByChange(d.sections);
  const shadeFrom = d.cases.findIndex(c => c.is_recent);
  return (
    <>
      {st.group === 'week' && (
        <ul className="mb-3 flex gap-4 text-xs font-medium text-muted-foreground" aria-label="Dot size legend">
          <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--navy)' }} />1 case</li>
          <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--navy)' }} />2+ cases</li>
        </ul>
      )}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        {sorted.map(s => {
          const score = (arr: { section_id: number; score: number | null }[]) => arr.find(x => x.section_id === s.id)?.score ?? null;
          let pts: Pt[]; let rolling: (number | null)[] | undefined;
          if (st.group === 'case') {
            const vals = d.cases.map(c => score(c.sections));
            pts = d.cases.map((c, i) => ({ x: i, v: vals[i], label: `${calDate(c.session_date).long}: ${c.prompt}` }));
            rolling = trailing3(vals);
          } else {
            pts = d.weeks.map((w, i) => ({ x: i, v: w.case_count ? score(w.sections) : null, big: w.case_count >= 2,
              label: `Week of ${calDate(w.week_start).long}, ${w.case_count} ${w.case_count === 1 ? 'case' : 'cases'}` }));
          }
          return (
            <article key={s.id} data-testid={`card-trend-${s.id}`} className="min-w-0 rounded-lg bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold leading-tight">{s.name}</h3>
                <ChangePill c={s.change} testid={`pill-change-${s.id}`} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Badge v={s.recent_avg} className="text-sm py-0.5" />
                <span>recent · was {s.earlier_avg === null ? '–' : fmt1(s.earlier_avg)}</span>
              </p>
              <Spark pts={pts} rolling={rolling} shadeFrom={st.group === 'case' ? shadeFrom : undefined} name={s.name} />
            </article>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Heatmap ---------------- */
function Heatmap({ d, st }: { d: SectionProgress; st: SPState }) {
  const ref = useRef<HTMLDivElement>(null);
  const byCase = st.group === 'case';
  const cols = byCase
    ? d.cases.map(c => ({ key: c.id, sections: c.sections, head: (
      <Link href={`/sessions/${c.id}`} aria-label={`${calDate(c.session_date).long}: ${c.prompt}`} title={`${calDate(c.session_date).long}: ${c.prompt}`}
        data-testid={`link-heatmap-session-${c.id}`}
        className="ip-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded px-1 text-xs whitespace-nowrap underline underline-offset-2 decoration-[color:var(--green)] hover:bg-[color:var(--panel)]">
        {calDate(c.session_date).short}</Link>) }))
    : d.weeks.map(w => ({ key: w.week_start, sections: w.sections, empty: w.case_count === 0, head: (
      <span className="inline-flex flex-col items-center px-1 text-xs whitespace-nowrap leading-tight">
        <span>{calDate(w.week_start).short}</span>
        <span className="font-normal text-muted-foreground">{w.case_count} {w.case_count === 1 ? 'case' : 'cases'}</span>
      </span>) }));
  useLayoutEffect(() => { const el = ref.current; if (el) el.scrollLeft = el.scrollWidth; }, [st.group, st.range, st.view, d]);
  return (
    <>
      <div ref={ref} className="w-full min-w-0 max-w-full overflow-x-auto rounded-lg bg-white" style={{ contain: 'inline-size layout paint' }} data-testid="scroll-heatmap">
        <table className="border-separate border-spacing-1 text-sm">
          <caption className="sr-only">Section scores {byCase ? 'per case' : 'per week'}, oldest first, with recent 5 versus earlier 5 trend.</caption>
          <thead><tr>
            <th scope="col" className="sticky left-0 z-10 bg-white text-left px-2 font-semibold text-xs text-muted-foreground">Section</th>
            {cols.map(c => <th key={c.key} scope="col" className="px-0 font-semibold">{c.head}</th>)}
            <th scope="col" className="px-2 text-xs font-semibold text-muted-foreground">Trend</th>
          </tr></thead>
          <tbody>
            {d.sections.map(s => (
              <tr key={s.id}>
                <th scope="row" className="sticky left-0 z-10 bg-white text-left font-medium px-2 whitespace-nowrap max-w-[9rem] truncate" title={s.name}>{s.name}</th>
                {cols.map(c => {
                  const v = c.sections.find(x => x.section_id === s.id)?.score ?? null;
                  const [bg, fg] = scoreColors(v);
                  return (
                    <td key={c.key} data-testid={`cell-heatmap-${c.key}-${s.id}`} className="h-11 min-w-11 rounded px-1 text-center font-bold tabular-nums"
                      style={{ background: bg, color: fg }}>
                      {v === null ? <><span aria-hidden>–</span><span className="sr-only">N/A</span></> : byCase ? v : fmt1(v)}
                    </td>
                  );
                })}
                <td className="px-2 text-center font-bold tabular-nums whitespace-nowrap" data-testid={`text-heatmap-trend-${s.id}`}
                  style={{ color: s.change === null || s.change === 0 ? '#5B6577' : s.change > 0 ? SP_UP[1] : SP_DOWN[1] }}>
                  {s.change === null ? '–' : `${s.change > 0 ? '+' : ''}${fmt1(s.change)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium" aria-label="Score color legend">
        {[1, 2, 3, 4, 5].map(n => <li key={n} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: SP_COLORS[n][0] }} />{n}</li>)}
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-sm" style={{ background: SP_NA[0] }} />N/A</li>
      </ul>
    </>
  );
}

/* ---------------- Averages ---------------- */
function Averages({ sections }: { sections: SectionProgressSection[] }) {
  return (
    <>
      <ul className="space-y-3" data-testid="list-section-averages">
        {sections.map(s => {
          const a = s.all_time_avg, r = s.recent_avg;
          return (
            <li key={s.id} className="grid grid-cols-[minmax(0,8rem)_1fr_auto] sm:grid-cols-[10rem_1fr_6rem] items-center gap-3">
              <span className="truncate text-sm font-medium" title={s.name}>{s.name}</span>
              <div className="relative h-5 rounded bg-white" aria-hidden>
                {a !== null && <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(a / 5) * 100}%`, background: scoreColors(a)[0] }} />}
                {r !== null && <div className="absolute -inset-y-1 w-0.5 rounded" style={{ left: `calc(${(r / 5) * 100}% - 1px)`, background: 'var(--navy)' }} />}
              </div>
              <span className="text-right text-sm font-bold tabular-nums whitespace-nowrap" data-testid={`text-average-${s.id}`}>
                {a === null ? '–' : fmt1(a)} → {r === null ? '–' : fmt1(r)}
              </span>
              <span className="sr-only">{s.name}: all-time average {a === null ? 'not scored' : fmt1(a)}, recent 5 average {r === null ? 'not scored' : fmt1(r)}</span>
            </li>
          );
        })}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium" aria-label="Averages legend">
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-5 rounded-sm" style={{ background: SP_COLORS[4][0] }} />All-time average</li>
        <li className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3.5 w-0.5" style={{ background: 'var(--navy)' }} />Recent 5 cases</li>
      </ul>
    </>
  );
}

export function SectionProgressCard({ d, st, set, loading }: { d: SectionProgress; st: SPState; set: (p: Partial<SPState>) => void; loading?: boolean }) {
  const anyScored = d.sections.some(s => s.times_scored > 0);
  return (
    <section aria-labelledby="h-progress" className="min-w-0 rounded-xl p-5 sm:p-6" style={{ background: 'var(--panel)' }} data-testid="card-section-progress">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 id="h-progress" className="text-lg font-bold tracking-tight">Section progress</h2>
          <div className="mt-1 h-0.5 w-10 rounded" style={{ background: 'var(--green)' }} />
          {anyScored && <p className="mt-2 text-sm text-muted-foreground" data-testid="text-progress-subtitle">{subtitle(st)}</p>}
        </div>
        {anyScored && (
          <div className="flex flex-wrap gap-2">
            <Seg label="View" testid="seg-view" value={st.view} onChange={view => set({ view })}
              options={[{ v: 'trends', label: 'Trends' }, { v: 'heatmap', label: 'Heatmap' }, { v: 'averages', label: 'Averages' }]} />
            {st.view !== 'averages' && <>
              <Seg label="Group" testid="seg-group" value={st.group} onChange={group => set({ group })}
                options={[{ v: 'case', label: 'By case' }, { v: 'week', label: 'By week' }]} />
              <Seg label="Range" testid="seg-range" value={st.range} onChange={range => set({ range })}
                options={[{ v: 'last10', label: 'Last 10' }, { v: 'all', label: 'All cases' }]} />
            </>}
          </div>
        )}
      </div>
      <div className={`mt-5 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading || undefined}>
        {!anyScored ? (
          <div className="rounded-lg bg-white p-6 text-center sm:text-left" data-testid="status-progress-empty">
            <p className="font-medium">Score the sections of a case to see your progress.</p>
            <Link href="/sessions/new" data-testid="link-progress-log-session"
              className="ip-focus mt-4 min-h-11 px-5 rounded-lg inline-flex items-center justify-center font-semibold text-white" style={{ background: '#2E9E6B' }}>
              + Log session
            </Link>
          </div>
        ) : st.view === 'trends' ? <Trends d={d} st={st} /> : st.view === 'heatmap' ? <Heatmap d={d} st={st} /> : <Averages sections={d.sections} />}
      </div>
    </section>
  );
}
