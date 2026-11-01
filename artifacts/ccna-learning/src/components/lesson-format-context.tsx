import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import type { LessonBlock } from "@workspace/api-client-react";

export type TextBlock = Extract<
  LessonBlock,
  { type: "richText" | "paragraph" | "heading" | "quote" | "callout" }
>;
export type ListControls = {
  ordered: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  setOrdered: (ordered: boolean) => void;
  indent: (delta: number) => void;
};
export type FormatTarget = {
  editor: Editor;
  getBlock?: () => TextBlock;
  update?: (block: LessonBlock) => void;
  getList?: () => ListControls;
};
export function createFormatStore() {
  let target: FormatTarget | null = null,
    version = 0;
  const listeners = new Set<() => void>();
  const refresh = () => {
    version++;
    listeners.forEach((notify) => notify());
  };
  return {
    get: () => target,
    snapshot: () => version,
    subscribe: (notify: () => void) => {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    activate: (next: FormatTarget | null) => {
      target = next;
      refresh();
    },
    release: (editor: Editor) => {
      if (target?.editor === editor) {
        target = null;
        refresh();
      }
    },
    refresh,
  };
}
const FormatContext = createContext<ReturnType<typeof createFormatStore> | null>(null);
export const useFormatStore = () => useContext(FormatContext);
export function LessonFormatProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createFormatStore);
  return (
    <FormatContext.Provider value={store}>
      <div
        className="lesson-format-scope"
        onFocusCapture={(event) => {
          const element = event.target as HTMLElement;
          // Numeric fields, URLs, CLI and plain table cells never receive text commands.
          if (!element.closest(".visual-rich-editor, .visual-format-toolbar")) store.activate(null);
        }}
      >
        {children}
      </div>
    </FormatContext.Provider>
  );
}
export function useFormatTarget(store: ReturnType<typeof createFormatStore>) {
  useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const target = store.get();
  return target && !target.editor.isDestroyed ? target : null;
}
