import { useEffect } from 'react';
import { getGetQuestionTypesQueryKey, useGetQuestionTypes } from '@workspace/api-client-react';
import { useAuth } from '@/auth';
import { CustomTag } from './category-select';

export function PracticeAreas() {
  const { user, refresh } = useAuth();
  const { data, isLoading, error, refetch, isFetching } = useGetQuestionTypes({
    query: {
      queryKey: [...getGetQuestionTypesQueryKey(), user?.id],
      enabled: !!user,
      staleTime: 60_000,
      retry: false,
    },
    request: { credentials: 'same-origin' },
  });
  useEffect(() => {
    if (error && 'status' in error && error.status === 401) void refresh();
  }, [error, refresh]);

  return (
    <section className="mt-10 sm:mt-12" aria-labelledby="practice-areas-heading">
      <h2 id="practice-areas-heading" className="text-xl sm:text-2xl font-bold tracking-tight">
        Your practice areas
      </h2>
      {isLoading ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">Loading practice areas...</p>
      ) : error ? (
        <div className="mt-4 space-y-2">
          <p role="alert" className="text-sm" style={{ color: 'var(--score-1)' }}>
            Unable to load practice areas. Please try again.
          </p>
          <button className="ip-focus min-h-11 px-4 rounded-lg border font-semibold"
            disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      ) : data ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(['case', 'behavioral'] as const).map(kind => (
            <div key={kind} className="min-w-0 rounded-xl p-5 sm:p-6" style={{ background: 'var(--panel)' }}>
              <h3 className="text-base font-semibold">{kind === 'case' ? 'Case' : 'Behavioral'}</h3>
              {data[kind].length ? (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label={`${kind === 'case' ? 'Case' : 'Behavioral'} question types`}>
                  {data[kind].map(type => (
                    <li key={type.id} className="max-w-full rounded-full border bg-white px-3 py-1.5 text-sm break-words"
                      style={{ borderColor: 'var(--green)' }} data-testid={`chip-practice-area-${type.id}`}>{type.name}{type.user_id != null && <CustomTag />}</li>
                  ))}
                </ul>
              ) : <p className="mt-4 text-sm text-muted-foreground">No practice areas available yet.</p>}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
