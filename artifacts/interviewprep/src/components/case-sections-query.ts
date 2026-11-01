import { getGetCaseSectionsQueryKey, useGetCaseSections } from '@workspace/api-client-react';
import { sessionRequestOptions, useAuth } from '@/auth';

export function useCaseSections(enabled = true) {
  const { user } = useAuth();
  return useGetCaseSections({
    query: { queryKey: [...getGetCaseSectionsQueryKey(), user?.id], enabled: !!user && enabled, retry: false },
    request: sessionRequestOptions(),
  });
}
