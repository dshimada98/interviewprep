import { useState } from 'react';
import { Link } from 'wouter';
import { keepPreviousData } from '@tanstack/react-query';
import { BookOpen, Plus } from 'lucide-react';
import { useListStories, type StorySummary } from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';
import { ErrorPanel, Shell, use401 } from './sessions';
import { storyListKey } from './session-keys';
import { useBehavioralTypes } from './stories-form';
import { CustomTag, isCustom } from './category-select';

export function practicedLine(times: number, avg: number | null) {
  if (!times) return 'Not practiced yet';
  return `Practiced ${times}\u00d7${avg != null ? ` \u00b7 avg ${avg.toFixed(1)}` : ''}`;
}

function scoreColor(avg: number | null) {
  if (avg == null) return 'hsl(var(--border))';
  return `var(--score-${Math.min(5, Math.max(1, Math.round(avg)))})`;
}

function StoryCards({ data }: { data: StorySummary[] }) {
  return (
    <ul className="mt-6 grid gap-3 md:grid-cols-2" aria-label="Stories">
      {data.map((s, i) => (
        <li key={s.id} className="ip-rise min-w-0" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <Link href={`/stories/${s.id}`} data-testid={`card-story-${s.id}`}
            className="ip-focus group flex h-full flex-col rounded-xl border bg-white p-5 transition-colors hover:border-[color:var(--navy)]"
            style={{ borderTop: `4px solid ${scoreColor(s.times_practiced ? s.average_score : null)}` }}>
            <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--green-text)' }}>{s.competency_name}</span>
            <span className="mt-2 text-lg font-bold leading-snug break-words group-hover:underline underline-offset-4" data-testid={`text-story-title-${s.id}`}>{s.title}</span>
            {s.context && <span className="mt-1.5 text-sm text-muted-foreground line-clamp-2 break-words">{s.context}</span>}
            <span className="mt-auto pt-4 text-sm font-semibold tabular-nums" data-testid={`text-story-stats-${s.id}`}
              style={{ color: s.times_practiced ? 'var(--navy)' : undefined }}>
              <span className={s.times_practiced ? '' : 'text-muted-foreground font-medium'}>{practicedLine(s.times_practiced, s.average_score)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function StoriesListPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<number | null>(null);
  const types = useBehavioralTypes();
  const all = useListStories(undefined, {
    query: { queryKey: storyListKey(user?.id), enabled: !!user, refetchOnMount: 'always', retry: false },
    request: sessionRequestOptions(),
  });
  use401(all.error);
  const filtered = useListStories({ competency: filter ?? 0 }, {
    query: { queryKey: storyListKey(user?.id, filter ?? 0), enabled: !!user && filter !== null, refetchOnMount: 'always', retry: false, placeholderData: keepPreviousData },
    request: sessionRequestOptions(),
  });
  use401(filtered.error);
  const q = filter === null ? all : filtered;
  const counts = new Map<number, number>();
  for (const s of all.data ?? []) counts.set(s.competency_id, (counts.get(s.competency_id) ?? 0) + 1);
  const none = all.data && all.data.length === 0;

  const chip = (id: number | null, label: string, n: number | undefined, custom = false) => {
    const on = filter === id;
    return (
      <button key={id ?? 'all'} type="button" aria-pressed={on} data-testid={`chip-competency-${id ?? 'all'}`} onClick={() => setFilter(id)}
        className="ip-focus min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors hover:border-[color:var(--navy)]"
        style={on ? { background: 'var(--navy)', color: 'white', borderColor: 'var(--navy)' } : { background: 'white' }}>
        {label}{custom && <CustomTag on={on} />} <span className="tabular-nums" style={{ opacity: on ? 0.8 : 0.6 }}>({n ?? 0})</span>
      </button>
    );
  };

  return (
    <Shell title="Stories">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
        <div className="ip-rise">
          <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--green-text)' }}>Story bank</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Your STAR stories</h1>
        </div>
        <Link href="/stories/new" data-testid="link-new-story"
          className="ip-focus ip-rise min-h-11 px-5 rounded-lg inline-flex items-center justify-center gap-2 font-semibold text-white"
          style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
          <Plus className="h-4 w-4" aria-hidden />Add a story
        </Link>
      </div>

      {all.data && (
        <div role="group" aria-label="Filter by competency" className="mt-8 flex flex-wrap gap-2" data-testid="group-competency-chips">
          {chip(null, 'All', all.data.length)}
          {(types.data?.behavioral ?? []).map(t => chip(t.id, t.name, counts.get(t.id), isCustom(t)))}
        </div>
      )}

      {all.isLoading || (filter !== null && filtered.isLoading) ? (
        <div className="mt-8 grid gap-3 md:grid-cols-2" aria-busy="true"><span className="sr-only" role="status">Loading stories</span>
          {[0, 1, 2, 3].map(i => <div key={i} className="ip-skel h-36 rounded-xl" />)}
        </div>
      ) : q.error && !q.data ? (
        <ErrorPanel msg="Unable to load your stories. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : none ? (
        <div className="ip-rise mt-8 rounded-xl p-8 sm:p-12 text-center" style={{ background: 'var(--panel)' }} data-testid="status-empty-stories">
          <div aria-hidden className="mx-auto flex w-fit gap-1.5">
            {['S', 'T', 'A', 'R'].map((l, i) => <span key={l} className="grid h-10 w-10 place-items-center rounded-lg font-bold text-white" style={{ background: i === 3 ? 'var(--green)' : 'var(--navy)' }}>{l}</span>)}
          </div>
          <p className="mt-5 font-semibold max-w-sm mx-auto">No stories yet. Add the stories you'll use in behavioral interviews.</p>
          <Link href="/stories/new" data-testid="link-empty-add-story" className="ip-focus mt-6 min-h-11 px-5 rounded-lg inline-flex items-center gap-2 font-semibold text-white" style={{ background: 'var(--navy)' }}>
            <Plus className="h-4 w-4" aria-hidden />Add a story
          </Link>
        </div>
      ) : q.data && q.data.length === 0 ? (
        <div className="ip-rise mt-6 rounded-xl border border-dashed p-8 text-center" data-testid="status-no-stories-filter">
          <BookOpen className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-semibold">No stories for this competency yet.</p>
          <button type="button" onClick={() => setFilter(null)} data-testid="button-show-all-stories" className="ip-focus mt-4 min-h-11 px-5 rounded-lg border bg-white font-semibold">Show all stories</button>
        </div>
      ) : q.data ? <div className={q.isPlaceholderData ? 'opacity-60 transition-opacity' : 'transition-opacity'}><StoryCards data={q.data} /></div> : null}
    </Shell>
  );
}
