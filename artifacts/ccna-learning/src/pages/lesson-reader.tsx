import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import {
  getCurriculum,
  lessonRequest,
  type LessonSummary,
  type LessonPublished,
} from "@workspace/api-client-react";
import { useNexusIdentity } from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { LessonContent } from "../components/lesson-content";
import { LearningSidebar } from "../components/learning-sidebar";
import { useLessonStudy, ReaderStudyTools } from "../components/study-tools";
import {
  useReadingPosition,
  measureReadingPosition,
  resumeReadingPosition,
  captureReadingAnchor,
  restoreReadingAnchor,
} from "../lib/reading-position";
import "../lessons.css";
import "../learning-workspace.css";

type LessonResult = {
  lesson: LessonPublished;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
};
export function lessonError(error: unknown, context: "read" | "admin" | "library" = "read") {
  const value = error as {
    status?: number;
    data?: {
      error?: {
        code?: string;
        message?: string;
        details?: { path?: string; code?: string; message?: string }[];
      };
    };
  };
  const problem = value?.data?.error;
  if (context === "library" && value?.status === 400 && problem?.code === "VALIDATION_ERROR") {
    if (problem.details?.some((issue) => issue.path === "" && /uuid/i.test(issue.message ?? "")))
      return "The running API treated the lesson library route as a lesson ID. Restart the API with the latest source, then retry. No lesson fields need editing.";
    return "The API rejected the lesson inventory filters or route. Clear the filters and retry. If the default list still fails, restart the API with the latest source.";
  }
  if (
    value?.status === 500 &&
    ["LESSON_RESPONSE_INVALID", "LESSON_PUBLISHED_DATA_INVALID"].includes(problem?.code ?? "")
  ) {
    const paths = problem?.details
      ?.map((issue) => issue.path)
      .filter((path) => typeof path === "string" && /^[a-zA-Z0-9_.]+$/.test(path))
      .slice(0, 8);
    return (
      (problem?.message ||
        "The API returned invalid lesson metadata. Restart the API with the latest source, then retry.") +
      (paths?.length ? " Diagnostic fields: " + paths.join(", ") + "." : "")
    );
  }
  if ((context === "admin" || context === "library") && value?.status === 404) {
    if (value.data?.error?.code === "LESSON_NOT_FOUND")
      return "This draft no longer exists. Your unsaved content is retained; reload the lesson inventory before saving again.";
    return "The lesson management endpoint is unavailable on the running API. Restart the API with the latest source, then retry. Your unsaved content is retained.";
  }
  if (value?.status === 503 && value.data?.error?.code === "LESSONS_NOT_READY")
    return "Lesson storage is not activated yet. An administrator must approve and apply the prepared migration.";
  if (value?.status === 503)
    return "The lesson API is temporarily unavailable. Retry later; your unsaved content is retained.";
  if (value?.status === 404)
    return "This lesson is not available. It may be unpublished, removed, or belong to another chapter.";
  return value?.data?.error?.message || "Lessons could not load. Please retry.";
}
export function LessonReader({ chapterId, lessonId }: { chapterId: string; lessonId?: string }) {
  const auth = useAuth();
  const identity = useNexusIdentity(),
    content = useRef<HTMLElement>(null);
  const [size, setSize] = useState(18),
    [dark, setDark] = useState(false),
    [lineHeight, setLineHeight] = useState(1.85),
    [width, setWidth] = useState("comfortable"),
    [focusWidth, setFocusWidth] = useState<"comfortable" | "wide" | "full">("wide"),
    [focus, setFocus] = useState(false),
    [pathOpen, setPathOpen] = useState(true);
  const curriculum = useQuery({
    queryKey: sessionQueryKey(["/api/curriculum"], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => getCurriculum(signal),
  });
  const list = useQuery({
    queryKey: sessionQueryKey(["/api/chapters", chapterId, "lessons"], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      lessonRequest<{ items: LessonSummary[] }>(
        `/api/chapters/${encodeURIComponent(chapterId)}/lessons`,
        { signal },
      ),
  });
  const detail = useQuery({
    queryKey: sessionQueryKey(["/api/lessons", chapterId, lessonId], identity),
    enabled: !!identity && !!lessonId,
    gcTime: 0,
    retry: false,
    placeholderData: () => undefined,
    queryFn: ({ signal }) =>
      lessonRequest<LessonResult>(`/api/lessons/${encodeURIComponent(lessonId!)}`, { signal }),
  });
  const chapter = curriculum.data?.domains
    .flatMap((domain) =>
      domain.sections.flatMap((section) =>
        section.chapters.map((ch) => ({ ...ch, domain: domain.title })),
      ),
    )
    .find((ch) => ch.id === chapterId);
  const result = detail.data,
    lesson = result?.lesson;
  const mismatch = lesson && lesson.chapterId !== chapterId;
  const study = useLessonStudy(mismatch ? undefined : lesson);
  const problem = list.error || curriculum.error || (lessonId ? detail.error : null);
  // The lesson response can arrive before curriculum/list metadata. Attach only
  // when the article is actually rendered, not while its ref is still null.
  const readingReady =
    auth.isLoaded &&
    identity &&
    lesson &&
    !mismatch &&
    !problem &&
    !list.isPending &&
    !curriculum.isPending &&
    !detail.isPending;
  const position = useReadingPosition(
    content,
    readingReady ? `${lesson.id}:${lesson.revisionId}` : "",
    `${focus}:${pathOpen}:${size}:${lineHeight}:${width}:${focusWidth}`,
  );
  const progress = position.percent;
  const toggleFocus = () => {
    const anchor = captureReadingAnchor(content.current);
    setFocus((previous) => !previous);
    requestAnimationFrame(() => restoreReadingAnchor(content.current, anchor));
  };
  const savePosition = () => content.current && study.progressAction(
    study.progress.state === "NOT_STARTED" ? "start" : "position",
    measureReadingPosition(content.current).blockId,
  );
  const resumePosition = () => resumeReadingPosition(content.current, study.progress.blockId);
  const hasSavedPosition = !!study.progress.blockId && !!lesson?.blocks.some(block => block.id === study.progress.blockId);
  return (
    <div
      className={`lesson-workspace ${dark ? "lesson-dark" : ""} ${focus ? "lesson-focus-mode" : ""} ${pathOpen ? "" : "lesson-path-collapsed"}`}
      data-focus-width={focusWidth}
      style={
        {
          "--lesson-font-size": `${size}px`,
          "--lesson-line-height": lineHeight,
          "--lesson-reading-width": width === "wide" ? "80ch" : "65ch",
        } as React.CSSProperties
      }
    >
      <nav className="lesson-breadcrumb" aria-label="Breadcrumb">
        <Link href="/topics">Learning curriculum</Link>
        <span>/</span>
        {chapter?.domain && (
          <>
            <span>{chapter.domain}</span>
            <span>/</span>
          </>
        )}
        {lessonId ? (
          <Link href={`/learn/chapters/${chapterId}`}>{chapter?.title || "Chapter lessons"}</Link>
        ) : (
          <span>{chapter?.title || "Chapter lessons"}</span>
        )}
        {lessonId && (
          <>
            <span>/</span>
            <span aria-current="page">{lesson?.title || "Lesson"}</span>
          </>
        )}
      </nav>
      <div className="lesson-workspace-controls">
        <button
          type="button"
          className="lesson-path-toggle"
          aria-expanded={pathOpen}
          onClick={() => setPathOpen(!pathOpen)}
        >
          {pathOpen ? "Collapse learning path" : "Show learning path"}
        </button>

      </div>
      <div className="lesson-learning-layout">
        {!!identity && curriculum.data && (
          <LearningSidebar
            curriculum={curriculum.data}
            chapterId={chapterId}
            lessonId={mismatch ? undefined : lessonId}
            lesson={mismatch ? undefined : lesson}
          />
        )}
        <section className="lesson-main-content" id="lesson-main" aria-label="Lesson content">
          {!auth.isLoaded ? (
            <p role="status">Loading your learning session…</p>
          ) : !identity ? (
            <p role="status">Sign in to read published lessons.</p>
          ) : problem ? (
            <div role="alert" className="lesson-state">
              <h1>Learning could not load</h1>
              <p>{lessonError(problem)}</p>
              <button
                onClick={() => {
                  void curriculum.refetch();
                  void list.refetch();
                  if (lessonId) void detail.refetch();
                }}
              >
                Retry
              </button>
            </div>
          ) : list.isPending || curriculum.isPending || (lessonId && detail.isPending) ? (
            <div role="status" className="lesson-state">
              Loading lessons…
            </div>
          ) : mismatch ? (
            <div role="alert">
              This lesson does not belong to this chapter.{" "}
              <Link href={`/learn/chapters/${chapterId}`}>Return to chapter</Link>
            </div>
          ) : !lessonId ? (
            <>
              <header className="lesson-heading">
                <p className="eyebrow">{chapter?.domain || "Learning curriculum"}</p>
                <h1>{chapter?.title || "Chapter lessons"}</h1>
                <p>{chapter?.description}</p>
                <p>
                  Explore published lessons in reading order. Practice remains a separate activity.
                </p>
              </header>
              {!list.data?.items.length ? (
                <section className="lesson-state">
                  <h2>Lessons coming soon</h2>
                  <p>No published lessons are available for this chapter yet.</p>
                  <Link href="/topics">Return to curriculum and practice</Link>
                </section>
              ) : (
                <ol className="lesson-catalog">
                  {list.data.items.map((item, index) => (
                    <li key={item.id}>
                      <span className="lesson-number">{index + 1}</span>
                      <div>
                        <h2>
                          <Link href={`/learn/chapters/${chapterId}/lessons/${item.id}`}>
                            {item.title}
                          </Link>
                        </h2>
                        <p>{item.description}</p>
                        <small>{item.estimatedMinutes} min read</small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            lesson && (
              <>
                <div className="lesson-reading-tools" role="group" aria-label="Reading controls">
                  <button type="button" aria-pressed={focus} onClick={toggleFocus}>
                    {focus ? "Exit focus reading" : "Focus reading"}
                  </button>
                  <button type="button" disabled={!study.ready || study.busy || !position.blockId}
                    onClick={() => void savePosition()} aria-describedby="reading-save-status">
                    {study.busy ? "Saving..." : "Save Position"}
                  </button>
                  <button type="button" disabled={!study.ready || study.busy || !hasSavedPosition}
                    onClick={resumePosition} aria-describedby="reading-save-status">
                    Resume Saved Position
                  </button>
                  <details className="lesson-reading-settings">
                    <summary>Reading settings</summary>
                    <div className="lesson-settings-options">
                      <label>
                        Text size{" "}
                        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                          <option value={16}>Compact</option>
                          <option value={18}>Comfortable</option>
                          <option value={21}>Large</option>
                        </select>
                      </label>
                      <button type="button" aria-pressed={dark} onClick={() => setDark(!dark)}>
                        {dark ? "Light reading" : "Dark reading"}
                      </button>
                      <label>
                        Line spacing
                        <select
                          value={lineHeight}
                          onChange={(e) => setLineHeight(Number(e.target.value))}
                        >
                          <option value={1.65}>Compact</option>
                          <option value={1.85}>Comfortable</option>
                          <option value={2.1}>Relaxed</option>
                        </select>
                      </label>
                      {focus ? (
                        <label>
                          Focus reading width
                          <select value={focusWidth} onChange={(event) => {
                            const anchor = captureReadingAnchor(content.current);
                            setFocusWidth(event.target.value as typeof focusWidth);
                            requestAnimationFrame(() => restoreReadingAnchor(content.current, anchor));
                          }}>
                            <option value="comfortable">Comfortable (800px)</option>
                            <option value="wide">Wide (1120px)</option>
                            <option value="full">Full available width</option>
                          </select>
                        </label>
                      ) : (
                      <label>
                        Reading width
                        <select value={width} onChange={(e) => setWidth(e.target.value)}>
                          <option value="comfortable">Comfortable</option>
                          <option value="wide">Wide</option>
                        </select>
                      </label>
                      )}
                    </div>
                  </details>
                  <span>Reading position {Math.round(progress)}%</span>
                  <span id="reading-save-status" className="lesson-text-muted" role="status">
                    {study.message || (study.query.isPending ? "Loading saved position..." : study.query.isError ? "Study tools unavailable; retry below." : !study.ready ? "Sign in and load study tools to save." : hasSavedPosition ? "Position saved. Resume returns to its section." : "No saved position. Save explicitly; completion is separate.")}
                  </span>
                  <progress aria-label="Reading position" value={progress} max={100} />
                </div>
                <div className="lesson-reading-layout">
                  <aside className="lesson-toc">
                    <ReaderStudyTools
                      key={study.key}
                      lesson={lesson}
                      study={study}
                      curriculum={curriculum.data}
                      currentPosition={position}
                      outline={<>
                    <details open className="lesson-outline-group">
                      <summary>Lesson outline</summary>
                      <nav aria-label="Lesson table of contents">
                        {lesson.blocks
                          .filter((block) => block.type === "heading")
                          .map((block) => (
                            <a
                              key={block.id}
                              href={`#section-${block.id}`}
                              aria-current={
                                position.headingId === block.id ? "location" : undefined
                              }
                              style={{
                                paddingInlineStart: `${Math.max(0, (block.type === "heading" ? block.level : 2) - 2) * 10 + 8}px`,
                              }}
                            >
                              {"text" in block ? block.text : "Section"}
                            </a>
                          ))}
                      </nav>
                    </details>
                      </>}

                    />
                  </aside>
                  <article
                    ref={content}
                    className="lesson-prose"
                    style={focus ? {
                      width: "100%",
                      maxWidth: focusWidth === "comfortable" ? "800px" : focusWidth === "wide" ? "1120px" : "none",
                    } : undefined}
                    key={lesson.id}
                    onMouseUp={study.captureSelection}
                    onKeyUp={(event) => {
                      if (event.shiftKey) study.captureSelection();
                    }}
                  >
                    <header className="lesson-heading">
                      <p className="eyebrow">
                        {lesson.chapter.domainName} ·{" "}
                        {lesson.chapter.bookReference || "Book chapter"}
                      </p>
                      <h1>{lesson.title}</h1>
                      <p>{lesson.description}</p>
                      <small>
                        {lesson.estimatedMinutes} min read · Published revision{" "}
                        {lesson.revisionNumber}
                      </small>
                      {lesson.objectives.length > 0 && (
                        <section className="lesson-objectives">
                          <h2>What you will learn</h2>
                          <ul>
                            {lesson.objectives.map((objective, index) => (
                              <li key={index}>{objective}</li>
                            ))}
                          </ul>
                        </section>
                      )}
                    </header>
                    <LessonContent
                      blocks={lesson.blocks}
                      highlights={study.highlights}
                      onBookmarkSection={study.ready ? study.bookmarkSection : undefined}
                    />
                    <nav className="lesson-pagination" aria-label="Lesson navigation">
                      {result.previous ? (
                        <Link href={`/learn/chapters/${chapterId}/lessons/${result.previous.id}`}>
                          ← {result.previous.title}
                        </Link>
                      ) : (
                        <span />
                      )}
                      {result.next ? (
                        <Link href={`/learn/chapters/${chapterId}/lessons/${result.next.id}`}>
                          {result.next.title} →
                        </Link>
                      ) : (
                        <Link href={`/learn/chapters/${chapterId}`}>Back to chapter</Link>
                      )}
                    </nav>
                  </article>
                </div>
              </>
            )
          )}
        </section>
      </div>
    </div>
  );
}
