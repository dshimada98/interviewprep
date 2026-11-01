import { Link } from 'wouter';
import { AddNoteButton } from './checklist';
import type { NextCaseFocusSection } from '@workspace/api-client-react';

type ScoreColor = (score: number) => string;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dates(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return { short: `${MONTHS[m - 1]} ${day}`, long: `${MONTHS[m - 1]} ${day}, ${y}` };
}

function FocusItem({ s, scoreColor }: { s: NextCaseFocusSection; scoreColor: ScoreColor }) {
  const avg = s.average_score.toFixed(1);
  const n = s.note;
  const dt = n ? dates(n.session_date) : null;
  return (
    <li className="min-w-0 rounded-lg p-4 sm:p-5" style={{ background: 'var(--panel)' }} data-testid={`card-focus-section-${s.section_id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold text-base break-words [overflow-wrap:anywhere]" data-testid={`text-focus-name-${s.section_id}`}>{s.section_name}</span>
        <span className="inline-flex min-w-10 justify-center rounded-md px-2 py-0.5 text-sm font-bold tabular-nums text-white"
          style={{ background: scoreColor(s.average_score) }} aria-label={`Average ${avg} out of 5`}
          data-testid={`badge-focus-average-${s.section_id}`}>{avg}</span>
        <span className="text-sm text-muted-foreground" data-testid={`text-focus-window-${s.section_id}`}>
          over your last {s.case_count} {s.case_count === 1 ? 'case' : 'cases'}
        </span>
      </div>
      {n && dt ? (
        <div className="mt-3 min-w-0">
          <blockquote className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] border-l-2 pl-3 text-sm leading-relaxed"
            style={{ borderColor: 'var(--green)' }} data-testid={`text-focus-note-${s.section_id}`}>
            &ldquo;{n.text}&rdquo;
          </blockquote>
          <Link href={`/sessions/${n.session_id}`} data-testid={`link-focus-source-${s.section_id}`}
            title={`${dt.long}: ${n.prompt}`} aria-label={`From: ${dt.long} · ${n.prompt}`}
            className="ip-focus mt-2 inline-block max-w-full text-xs font-medium underline underline-offset-2 decoration-[color:var(--green)] break-words [overflow-wrap:anywhere]">
            From: {dt.short} · {n.prompt}
          </Link>
          <div><AddNoteButton sessionId={n.session_id} sectionId={s.section_id} label={s.section_name} /></div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" data-testid={`text-focus-no-note-${s.section_id}`}>
          No improvement notes yet. Add one next time you score this section.
        </p>
      )}
    </li>
  );
}

export function NextCaseFocus({ focus, scoreColor }: { focus: NextCaseFocusSection[]; scoreColor: ScoreColor }) {
  return (
    <section aria-labelledby="h-next-focus" className="ip-rise min-w-0 rounded-xl border-l-4 bg-white p-5 sm:p-6"
      style={{ borderColor: '#1F2A44' }} data-testid="card-next-case-focus">
      <h2 id="h-next-focus" className="text-lg font-bold tracking-tight">Focus for your next case</h2>
      {focus.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="text-focus-empty">Score the sections of a case to get your focus areas.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {focus.map(s => <FocusItem key={s.section_id} s={s} scoreColor={scoreColor} />)}
        </ul>
      )}
    </section>
  );
}
