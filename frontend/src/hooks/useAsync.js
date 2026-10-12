import { useCallback, useEffect, useRef, useState } from 'react';

// The loading / error / data cycle every page needs, in one place.
//
// `fn` is kept in a ref so an inline arrow does not re-trigger the effect
// on every render — only the caller's `deps` and an explicit `reload()`
// do. The result is a discriminated state a page can switch on directly:
//
//   const { status, data, error, reload } = useAsync(() => browseApi.list(), []);
//   status === 'loading' | 'error' | 'ok'
//
// Stale results are dropped when the component unmounts or the inputs
// change, so a slow response can never overwrite a newer one.

export default function useAsync(fn, deps = []) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const [tick, setTick] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let active = true;

    setState((prev) => ({ status: 'loading', data: prev.data, error: null }));

    Promise.resolve()
      .then(() => fnRef.current())
      .then((data) => {
        if (active) setState({ status: 'ok', data, error: null });
      })
      .catch((error) => {
        if (active) setState({ status: 'error', data: null, error });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { ...state, reload };
}
