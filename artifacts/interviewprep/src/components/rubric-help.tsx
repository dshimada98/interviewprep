import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RubricScope } from '@workspace/api-client-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRubric, useRubricScope } from './rubric-query';
import { CALIBRATION_TIPS, levelName } from './score-levels';

function Levels({ scope, q }: { scope?: RubricScope; q: ReturnType<typeof useRubric> }) {
  if (q.isLoading) return <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="ip-skel h-10 rounded" />)}</div>;
  if (q.error || !scope) return (
    <div className="space-y-2">
      <p role="alert" className="text-sm font-medium" style={{ color: 'var(--score-1)' }}>Unable to load the rubric.</p>
      <button type="button" data-testid="button-retry-rubric-help" onClick={() => void q.refetch()} disabled={q.isFetching}
        className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold disabled:opacity-60">{q.isFetching ? 'Retrying...' : 'Retry'}</button>
    </div>
  );
  return (
    <ol className="space-y-1.5">
      {[...scope.entries].sort((a, b) => a.score - b.score).map(e => (
        <li key={e.score} className="flex gap-3 rounded-lg p-2 text-sm" style={{ background: 'var(--panel)' }} data-testid={`help-level-${scope.scope}-${e.score}`}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md font-bold text-white tabular-nums" style={{ background: `var(--score-${e.score})` }}>{e.score}</span>
          <span className="min-w-0 break-words"><span className="font-semibold">{e.level_name}</span>{e.edited && <span className="ml-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">edited</span>}
            <span className="block text-muted-foreground">{e.description}</span></span>
        </li>
      ))}
    </ol>
  );
}

/** "?" button opening all five levels: popover on laptops, bottom sheet on phones. */
export function RubricHelp({ scope, name }: { scope: string; name: string }) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const q = useRubric();
  const sc = q.data?.scopes.find(s => s.scope === scope);
  const trigger = (
    <button type="button" aria-label={`Rubric for ${name}`} data-testid={`button-rubric-help-${scope}`} onClick={mobile ? () => setOpen(true) : undefined}
      className="ip-focus h-11 w-11 shrink-0 grid place-items-center rounded-full text-sm font-bold hover:bg-[color:var(--panel)]">
      <span className="grid h-6 w-6 place-items-center rounded-full border" style={{ borderColor: 'var(--navy)' }}>?</span>
    </button>
  );
  if (mobile) return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl [&>button]:min-h-11 [&>button]:min-w-11" style={{ color: 'var(--navy)' }} data-testid={`sheet-rubric-${scope}`}>
          <SheetHeader className="pr-12 text-left"><SheetTitle>{name}</SheetTitle><SheetDescription>{sc?.subtitle ?? 'Rubric levels'}</SheetDescription></SheetHeader>
          <div className="mt-4"><Levels scope={sc} q={q} /></div>
        </SheetContent>
      </Sheet>
    </>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-h-[70vh] overflow-y-auto rounded-xl" style={{ color: 'var(--navy)' }} data-testid={`popover-rubric-${scope}`}>
        <p className="font-bold">{name}</p>
        {sc?.subtitle && <p className="text-xs text-muted-foreground">{sc.subtitle}</p>}
        <div className="mt-3"><Levels scope={sc} q={q} /></div>
      </PopoverContent>
    </Popover>
  );
}

/** "[level name]: [description]" for the selected score, from the effective personal rubric. */
export function SelectedLevel({ scope, score, testid }: { scope: string; score: number | null | undefined; testid: string }) {
  const sc = useRubricScope(scope);
  if (!score) return null;
  const desc = sc?.entries.find(e => e.score === score)?.description;
  return <p className="mt-1.5 break-words text-xs text-muted-foreground" data-testid={testid} aria-live="polite">{levelName(score)}{desc ? `: ${desc}` : ''}</p>;
}

export function CalibrationTips() {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="section-calibration-tips">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="button-calibration-tips"
        className="ip-focus min-h-11 inline-flex items-center gap-1 rounded text-sm font-semibold hover:underline underline-offset-4">
        {open ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}Calibration tips
      </button>
      {open && <TipsList />}
    </div>
  );
}

export function TipsList() {
  return (
    <ul className="mt-1 space-y-1.5 border-l-2 pl-4 text-sm" style={{ borderColor: 'var(--green)' }} data-testid="list-calibration-tips">
      {CALIBRATION_TIPS.map(t => <li key={t}>{t}</li>)}
    </ul>
  );
}
