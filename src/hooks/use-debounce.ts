// src/hooks/use-debounce.ts
import { useState, useEffect, useRef, useCallback } from "react";

// Debounce for values
export function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// Debounce for functions - Revised Signature
export function useDebounceFunction<
  // Args will be inferred as a tuple of the argument types of 'func'
  // Res will be inferred as the return type of 'func'
  Args extends unknown[], // Ensures Args is an array/tuple of types
  Res // No constraint needed on Res for this specific debounce, can be any return type
>(
  func: (...args: Args) => Res, // 'func' takes arguments of types defined by Args tuple
  waitFor: number
): (...args: Args) => void {
  // The debounced function will have the same args, but returns void
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  return useCallback(
    (...args: Args) => {
      // The arguments for the debounced function match 'func'
      if (timeout.current) {
        clearTimeout(timeout.current);
      }
      timeout.current = setTimeout(() => {
        func(...args); // Call the original function with its correct arguments
      }, waitFor);
    },
    // Dependencies: if 'func' itself is redefined (e.g., an inline arrow function in a component),
    // this useCallback will generate a new debounced function. This is usually desired
    // to capture the latest 'func'. If 'func' is stable (e.g., from useState or top-level),
    // this is also fine.
    [func, waitFor]
  );
}
