import { AlertCircle } from 'lucide-react';
import { useListStories } from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';
import { storyListKey } from './session-keys';

/** Optional "Story used" dropdown for behavioral sessions. Stories matching the chosen type are listed first. */
export function StorySelect({ value, onChange, typeId, disabled, error }: {
  value: string; onChange: (v: string) => void; typeId: string; disabled?: boolean; error?: string;
}) {
  const { user } = useAuth();
  const q = useListStories(undefined, {
    query: { queryKey: storyListKey(user?.id), enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  const all = q.data ?? [];
  const tid = Number(typeId);
  const matching = all.filter(s => s.competency_id === tid);
  const others = all.filter(s => s.competency_id !== tid);
  const missing = value && q.data && !all.some(s => String(s.id) === value);
  const err = error ? 'story_id-err' : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor="story_id" className="block text-sm font-semibold">Story used<span className="ml-1.5 font-normal text-muted-foreground">(optional)</span></label>
      {q.isLoading ? <div className="ip-skel h-11 rounded-lg" aria-busy="true"><span className="sr-only">Loading stories</span></div>
        : q.error && !q.data ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium" style={{ color: '#C0392B' }}>Unable to load your stories.</span>
            <button type="button" onClick={() => void q.refetch()} disabled={q.isFetching} data-testid="button-retry-stories"
              className="ip-focus min-h-11 px-4 rounded-lg border bg-white font-semibold">{q.isFetching ? 'Retrying...' : 'Retry'}</button>
          </div>
        ) : (
          <select id="story_id" data-testid="select-story" disabled={disabled} value={value} onChange={e => onChange(e.target.value)}
            aria-invalid={!!error} aria-describedby={err ?? 'story_id-hint'}
            className="ip-focus block w-full min-w-0 min-h-11 rounded-lg border bg-white px-3.5 text-base transition-colors hover:border-[color:var(--navy)]"
            style={{ borderColor: error ? '#C0392B' : undefined }}>
            <option value="">No story</option>
            {missing && <option value={value}>Selected story</option>}
            {matching.length > 0 && <optgroup label="Matches this question type">{matching.map(s => <option key={s.id} value={String(s.id)}>{s.title}</option>)}</optgroup>}
            {others.length > 0 && <optgroup label={matching.length ? 'Other stories' : 'Your stories'}>{others.map(s => <option key={s.id} value={String(s.id)}>{s.title} ({s.competency_name})</option>)}</optgroup>}
          </select>
        )}
      {error ? (
        <p id="story_id-err" role="alert" className="flex items-start gap-2 text-sm font-medium" style={{ color: '#C0392B' }}>
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden /><span>{error}</span>
        </p>
      ) : (
        <p id="story_id-hint" className="text-xs text-muted-foreground">
          {q.data && all.length === 0 ? 'You have no stories yet. Add one from the Stories page.' : 'Link the STAR story you told, if any.'}
        </p>
      )}
    </div>
  );
}
