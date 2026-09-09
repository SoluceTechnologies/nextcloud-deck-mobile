import { useCallback, useState } from 'react';

export interface AsyncAction<V, R> {
  mutate: (value: V) => void;
  mutateAsync: (value: V) => Promise<R>;
  isPending: boolean;
}

export function useAsyncAction<V, R = void>(run: (value: V) => Promise<R>): AsyncAction<V, R> {
  const [isPending, setIsPending] = useState(false);

  const mutateAsync = useCallback(
    async (value: V) => {
      setIsPending(true);
      try {
        return await run(value);
      } finally {
        setIsPending(false);
      }
    },
    [run],
  );

  const mutate = useCallback((value: V) => { void mutateAsync(value); }, [mutateAsync]);

  return { mutate, mutateAsync, isPending };
}
