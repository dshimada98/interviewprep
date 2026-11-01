import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Loader2, Pencil, Play, Trash2 } from 'lucide-react';
import { useDeleteStory } from '@workspace/api-client-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { sessionRequestOptions, useAuth } from '@/auth';
import { BackLink, ErrText, ErrorPanel, ScoreBar, Shell, fmtDate, use401 } from './sessions';
import { invalidateStories, statusOf, storyDetailKey } from './session-keys';
import { STAR, StoryNotFound, parseStoryId, useStoryQuery } from './stories-form';

function statsLine(n: number, avg: number | null) {
  return `Practiced ${n} ${n === 1 ? 'time' : 'times'} \u00b7 average ${avg != null ? avg.toFixed(1) : '—'}`;
}

export function StoryDetailPage({ rawId }: { rawId?: string }) {
  const id = parseStoryId(rawId);
  const { user } = useAuth();
  const q = useStoryQuery(id);
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [open, setOpen] = useState(false);
  const [delErr, setDelErr] = useState('');
  const del = useDeleteStory({ request: sessionRequestOptions() });
  use401(del.error);

  function gone() {
    if (id === null) return;
    qc.removeQueries({ queryKey: storyDetailKey(id, user?.id) });
    void invalidateStories(qc, user?.id);
    setOpen(false);
    nav('/stories');
  }
  function confirmDelete() {
    if (id === null) return;
    setDelErr('');
    del.mutate({ id }, {
      onSuccess: gone,
      onError: e => {
        if (statusOf(e) === 404) return gone();
        setOpen(false);
        setDelErr('Unable to delete this story. Please try again.');
      },
    });
  }

  const s = q.data;
  const linked = s?.sessions.length ?? 0;
  return (
    <Shell title="Story">
      <BackLink href="/stories">All stories</BackLink>
      {id === null || statusOf(q.error) === 404 ? <StoryNotFound /> : q.isLoading ? (
        <div className="mt-6 space-y-4" aria-busy="true"><span className="sr-only" role="status">Loading story</span>
          <div className="ip-skel h-8 w-64 rounded" /><div className="ip-skel h-40 rounded-xl" /><div className="ip-skel h-40 rounded-xl" />
        </div>
      ) : q.error ? (
        <ErrorPanel msg="Unable to load this story. Please try again." busy={q.isFetching} onRetry={() => void q.refetch()} />
      ) : s ? (
        <article className="mt-4">
          <header className="ip-rise flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: 'var(--green-text)' }} data-testid="text-story-competency">{s.competency_name}</p>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight break-words" data-testid="text-story-title">{s.title}</h1>
              {s.context && <p className="mt-2 text-muted-foreground break-words whitespace-pre-wrap" data-testid="text-story-context">{s.context}</p>}
              <p className="mt-3 text-sm font-semibold tabular-nums" data-testid="text-story-stats">{statsLine(s.times_practiced, s.average_score)}</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Link href={`/sessions/new?story=${s.id}`} data-testid="link-practice-story"
                className="ip-focus min-h-11 basis-full sm:basis-auto px-4 rounded-lg inline-flex items-center justify-center gap-2 font-semibold text-white"
                style={{ background: 'var(--navy)', borderBottom: '3px solid var(--green)' }}>
                <Play className="h-4 w-4" aria-hidden />Practice this story
              </Link>
              <Link href={`/stories/${s.id}/edit`} data-testid="link-edit-story"
                className="ip-focus min-h-11 flex-1 sm:flex-none px-4 rounded-lg inline-flex items-center justify-center gap-2 font-semibold border bg-white hover:border-[color:var(--navy)]">
                <Pencil className="h-4 w-4" aria-hidden />Edit
              </Link>
              <button type="button" data-testid="button-delete-story" onClick={() => setOpen(true)}
                className="ip-focus min-h-11 flex-1 sm:flex-none px-4 rounded-lg inline-flex items-center justify-center gap-2 font-semibold border bg-white"
                style={{ color: 'var(--score-1)', borderColor: 'var(--score-1)' }}>
                <Trash2 className="h-4 w-4" aria-hidden />Delete
              </button>
            </div>
          </header>
          {delErr && <div className="mt-4 rounded-lg border-l-4 bg-white p-3" style={{ borderColor: 'var(--score-1)' }} data-testid="status-delete-story-error"><ErrText>{delErr}</ErrText></div>}

          <div className="mt-8 rounded-xl overflow-hidden border bg-white">
            {STAR.map((st, i) => {
              const text = s[st.k];
              return (
                <section key={st.k} className="ip-rise grid gap-3 p-5 sm:p-6 sm:grid-cols-[3rem_minmax(0,1fr)] border-b last:border-b-0" style={{ animationDelay: `${60 + i * 50}ms` }} data-testid={`section-story-${st.k}`}>
                  <span aria-hidden className="hidden sm:grid h-12 w-12 place-items-center rounded-lg text-xl font-bold text-white" style={{ background: 'var(--navy)' }}>{st.letter}</span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold">{st.label}</h2>
                    {text ? <p className="mt-2 leading-relaxed whitespace-pre-wrap break-words">{text}</p>
                      : <p className="mt-2 text-sm text-muted-foreground">Not written yet.</p>}
                  </div>
                </section>
              );
            })}
          </div>

          <section className="ip-rise mt-8" style={{ animationDelay: '260ms' }}>
            <h2 className="text-lg font-bold">Used in</h2>
            {linked === 0 ? (
              <p className="mt-3 rounded-xl p-5 text-sm text-muted-foreground" style={{ background: 'var(--panel)' }} data-testid="status-story-unused">
                No sessions use this story yet. Practice it to start a record.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {s.sessions.map(u => (
                  <li key={u.id}>
                    <Link href={`/sessions/${u.id}`} data-testid={`link-story-session-${u.id}`}
                      className="ip-focus group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white p-4 hover:border-[color:var(--navy)]"
                      style={{ borderLeft: `4px solid var(--score-${u.overall_score})` }}>
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><CalendarDays className="h-4 w-4" aria-hidden />{fmtDate(u.session_date)}</span>
                      <span className="order-last basis-full sm:order-none sm:basis-0 sm:flex-1 min-w-0 truncate group-hover:underline underline-offset-4">{u.prompt}</span>
                      <span className="ml-auto inline-flex items-center gap-2"><ScoreBar score={u.overall_score} />
                        <span className="rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums text-white" style={{ background: `var(--score-${u.overall_score})` }}>{u.overall_score}/5</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="mt-6 text-xs text-muted-foreground">Added {new Date(s.created_at).toLocaleString()}</p>

          <AlertDialog open={open} onOpenChange={o => { if (!del.isPending) setOpen(o); }}>
            <AlertDialogContent className="rounded-xl" style={{ color: 'var(--navy)' }}>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this story? This can't be undone.</AlertDialogTitle>
                <AlertDialogDescription data-testid="text-delete-story-warning">
                  {linked > 0 ? `It's linked to ${linked} ${linked === 1 ? 'session' : 'sessions'}. They'll keep their scores but lose the link.` : `This permanently removes "${s.title}".`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2">
                <AlertDialogCancel data-testid="button-cancel-delete-story" className="ip-focus min-h-11 mt-0" disabled={del.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction data-testid="button-confirm-delete-story" disabled={del.isPending}
                  onClick={e => { e.preventDefault(); confirmDelete(); }}
                  className="ip-focus min-h-11 text-white inline-flex items-center gap-2" style={{ background: 'var(--score-1)' }}>
                  {del.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{del.isPending ? 'Deleting...' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </article>
      ) : null}
    </Shell>
  );
}
