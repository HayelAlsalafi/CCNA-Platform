import { useLayoutEffect, useRef, useState, type RefObject } from "react";

export type ReadingPosition = { percent: number; blockId: string | null; headingId: string | null };
export const emptyReadingPosition: ReadingPosition = { percent: 0, blockId: null, headingId: null };
export function readingPercent(
  articleTop: number,
  articleHeight: number,
  viewportTop: number,
  viewportHeight: number,
) {
  if (
    ![articleTop, articleHeight, viewportTop, viewportHeight].every(Number.isFinite) ||
    articleHeight <= 0 ||
    viewportHeight <= 0
  )
    return 0;
  if (articleHeight <= viewportHeight)
    return articleTop < viewportTop + viewportHeight &&
      articleTop + articleHeight <= viewportTop + viewportHeight
      ? 100
      : 0;
  return Math.max(
    0,
    Math.min(100, ((viewportTop - articleTop) / (articleHeight - viewportHeight)) * 100),
  );
}
export function readingScrollRoot(article: HTMLElement): HTMLElement | null {
  for (
    let parent = article.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    // overflow-x can compute overflow-y:auto on an unconstrained ancestor. Such
    // an element is not the scrolling viewport when it grows with the article.
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY) && parent.clientHeight > 0 && parent.scrollHeight > parent.clientHeight + 1)
      return parent;
  }
  return null;
}
export function measureReadingPosition(article: HTMLElement): ReadingPosition {
  const root = readingScrollRoot(article),
    rect = article.getBoundingClientRect();
  const top = root ? root.getBoundingClientRect().top + root.clientTop : 0;
  const height = root ? root.clientHeight : window.innerHeight;
  const blocks = [...article.querySelectorAll<HTMLElement>("[data-section-id]")];
  const current =
    blocks.filter((block) => block.getBoundingClientRect().top <= top + 24).at(-1) ?? blocks[0];
  const headings = blocks.filter((block) => block.querySelector("h1,h2,h3,h4,h5,h6"));
  const toolbar = article.closest(".lesson-workspace")?.querySelector<HTMLElement>(".lesson-reading-tools");
  const toolbarRect = toolbar?.getBoundingClientRect();
  const headingLine = toolbarRect && toolbarRect.bottom > top && toolbarRect.top < top + height
    ? Math.min(top + height, Math.max(top + 24, toolbarRect.bottom + 12))
    : top + 24;
  const heading = headings.filter((block) => block.getBoundingClientRect().top <= headingLine).at(-1);
  return {
    percent: readingPercent(rect.top, rect.height, top, height),
    blockId: current?.dataset.sectionId ?? null,
    headingId: heading?.dataset.sectionId ?? null,
  };
}
/** One local measurement per animation frame; never sends persistence requests. */
export function useReadingPosition(
  ref: RefObject<HTMLElement | null>,
  lessonKey: string,
  layoutKey: string,
) {
  const [state, setState] = useState<{ key: string; value: ReadingPosition }>({
    key: "",
    value: emptyReadingPosition,
  });
  const lastLesson = useRef("");
  useLayoutEffect(() => {
    const article = ref.current;
    if (!article || !lessonKey) return;
    if (
      lastLesson.current &&
      lastLesson.current !== lessonKey &&
      !window.location.hash.startsWith("#section-")
    )
      article.scrollIntoView?.({ block: "start", behavior: "auto" });
    lastLesson.current = lessonKey;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const workspace = article.closest<HTMLElement>(".lesson-workspace");
      const toolbar = workspace?.querySelector<HTMLElement>(".lesson-reading-tools");
      if (workspace && toolbar) {
        const inset = Math.max(0, parseFloat(getComputedStyle(toolbar).top) || 0);
        const hubTop = `${inset + toolbar.getBoundingClientRect().height + 12}px`;
        if (workspace.style.getPropertyValue("--study-hub-top") !== hubTop)
          workspace.style.setProperty("--study-hub-top", hubTop);
      }
      const next = measureReadingPosition(article);
      setState((previous) =>
        previous.key === lessonKey && JSON.stringify(previous.value) === JSON.stringify(next)
          ? previous
          : { key: lessonKey, value: next },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    // Capture observes scrolling inside the app shell as well as window scrolling.
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    article.addEventListener("load", schedule, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(article);
    const toolbar = article.closest(".lesson-workspace")?.querySelector(".lesson-reading-tools");
    if (toolbar) observer?.observe(toolbar);
    const root = readingScrollRoot(article);
    if (root) observer?.observe(root);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", schedule, true);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      article.removeEventListener("load", schedule, true);
    };
  }, [ref, lessonKey, layoutKey]);
  return state.key === lessonKey ? state.value : emptyReadingPosition;
}
export function resumeReadingPosition(article: HTMLElement | null, blockId: string | null) {
  const block =
    article &&
    [...article.querySelectorAll<HTMLElement>("[data-section-id]")].find(
      (node) => node.dataset.sectionId === blockId,
    );
  if (!block) return false;
  block.scrollIntoView({ block: "start", behavior: "auto" });
  return true;
}
export function captureReadingAnchor(article: HTMLElement | null) {
  if (!article) return null;
  const blockId = measureReadingPosition(article).blockId;
  const block = [...article.querySelectorAll<HTMLElement>("[data-section-id]")].find(
    (node) => node.dataset.sectionId === blockId,
  );
  if (!block) return null;
  const root = readingScrollRoot(article),
    top = root ? root.getBoundingClientRect().top + root.clientTop : 0;
  return { blockId, offset: block.getBoundingClientRect().top - top };
}
export function restoreReadingAnchor(
  article: HTMLElement | null,
  anchor: ReturnType<typeof captureReadingAnchor>,
) {
  if (!article || !anchor) return;
  const block = [...article.querySelectorAll<HTMLElement>("[data-section-id]")].find(
    (node) => node.dataset.sectionId === anchor.blockId,
  );
  if (!block) return;
  const root = readingScrollRoot(article),
    top = root ? root.getBoundingClientRect().top + root.clientTop : 0;
  const delta = block.getBoundingClientRect().top - top - anchor.offset;
  if (Math.abs(delta) < 1) return;
  if (root) root.scrollTop += delta;
  else window.scrollBy({ top: delta, behavior: "auto" });
}
