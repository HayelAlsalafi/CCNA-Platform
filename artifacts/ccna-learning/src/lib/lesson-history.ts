import { useReducer } from "react";
type History<T> = { past: T[]; present: T; future: T[] };
export function editHistory<T>(
  state: History<T>,
  action: { type: "edit"; patch: Partial<T> } | { type: "undo" | "redo" },
): History<T> {
  if (action.type === "edit")
    return {
      past: [...state.past, state.present].slice(-30),
      present: { ...state.present, ...action.patch },
      future: [],
    };
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present].slice(-30),
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
export function useLessonHistory<T>(initial: () => T) {
  const [state, dispatch] = useReducer(editHistory<T>, undefined, () => ({
    past: [],
    present: initial(),
    future: [],
  }));
  return {
    value: state.present,
    update: (patch: Partial<T>) => dispatch({ type: "edit", patch }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    canUndo: !!state.past.length,
    canRedo: !!state.future.length,
  };
}
