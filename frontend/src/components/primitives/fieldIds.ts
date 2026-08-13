import { useId } from "react";

export function useFieldIds(id?: string) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return {
    inputId,
    hintId: `${inputId}-hint`,
    errorId: `${inputId}-error`,
  };
}

export function describedBy(hint?: string, error?: string, hintId?: string, errorId?: string) {
  return [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
}
