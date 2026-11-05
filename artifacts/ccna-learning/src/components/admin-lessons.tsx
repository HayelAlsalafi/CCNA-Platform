import { UiMessage, DateText } from '../i18n';
import { useI18n } from '../i18n';
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  lessonRequest,
  getCurriculum,
  type LessonAdmin,
  type LessonInput,
  type LessonBlock,
  type LessonRevision,
  type LessonSummary,
  type LessonLibraryPage,
  type LessonLibraryItem,
} from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminQueryOptions, adminMutationOptions } from "../lib/admin-session";
import { RelationshipFilter } from "./topics-manager";
import { LessonContent } from "./lesson-content";
import { lessonError } from "../pages/lesson-reader";
import { Link } from "wouter";
import { useLessonHistory } from "../lib/lesson-history";
import { LessonFormatProvider } from "./lesson-format-context";
const LessonFormattingToolbar = lazy(() =>
  import("./lesson-rich-editor").then((module) => ({ default: module.LessonFormattingToolbar })),
);
import { VisualBlockEditor as BlockEditor } from "./lesson-visual-blocks";
import {LessonDeleteControl} from './lesson-delete-control';
import "../lessons.css";
import "../study.css";
import "../lesson-visual-editor.css";
import "../lesson-studio-workspace.css";

export function newLessonBlock(type: LessonBlock["type"]): LessonBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "richText":
      return { id, type, runs: [{ text: "" }] };
    case "paragraph":
      return { id, type, text: "" };
    case "quote":
      return { id, type, text: "" };
    case "list":
      return { id, type, ordered: false, items: [""] };
    case "heading":
      return { id, type, text: "", level: 2 };
    case "code":
      return { id, type, text: "", language: "cisco-ios" };
    case "callout":
      return { id, type, text: "", tone: "info" };
    case "image":
    case "diagram":
      return { id, type, url: "", alt: "", caption: "" };
    case "table":
      return { id, type, headers: ["Heading", "Heading"], rows: [["", ""]] };
    case "knowledgeCheck":
      return { id, type, prompt: "", choices: ["", ""], correctIndex: 0, explanation: "" };
    case "labReference":
      return { id, type, title: "", description: "" };
  }
}
const blockNames: Record<LessonBlock["type"], string> = {
  richText: "Formatted text",
  paragraph: "Plain text paragraph",
  quote: "Blockquote",
  list: "Ordered / unordered list",
  heading: "Section heading",
  code: "Cisco CLI / code",
  callout: "Callout",
  image: "Image",
  diagram: "Diagram image",
  table: "Reference table",
  knowledgeCheck: "Knowledge check",
  labReference: "Lab reference",
};
export function moveLessonBlock(blocks: LessonBlock[], index: number, direction: number) {
  const next = [...blocks],
    target = index + direction;
  if (target < 0 || target >= blocks.length) return blocks;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function duplicateLessonBlock(block: LessonBlock): LessonBlock {
  return { ...structuredClone(block), id: crypto.randomUUID() };
}
export function AdminLessonManager() {
  const { t: translateUi } = useI18n();
  const session = useAdminSession(),
    client = useQueryClient(),
    [chapterId, setChapterId] = useState(""),
    [domainId, setDomainId] = useState(""),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [status, setStatus] = useState(""),
    [volume, setVolume] = useState(""),
    [updatedAfter, setUpdatedAfter] = useState(""),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25),
    [editing, setEditing] = useState<LessonAdmin | "new" | null>(null),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (chapterId) params.set("chapterId", chapterId);
  if (domainId) params.set("domainCode", domainId.replace(/^d([1-6])$/, "$1.0"));
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  if (volume) params.set("volume", volume);
  if (updatedAfter) params.set("updatedAfter", updatedAfter + "T00:00:00.000Z");
  const options = adminQueryOptions(
    ["/api/admin/lessons", "library", params.toString()],
    session.identity,
  );
  const curriculum = useQuery({
    ...adminQueryOptions(["/api/admin/lessons", "chapters"], session.identity).query,
    queryFn: ({ signal }) => getCurriculum(signal),
  });
  const chapters =
    curriculum.data?.domains.flatMap((domain) =>
      domain.sections.flatMap((section) =>
        section.chapters.map((chapter) => ({
          id: chapter.id,
          title: `${domain.title} / ${chapter.title}`,
          domainId: domain.id,
        })),
      ),
    ) ?? [];
  const query = useQuery({
    ...options.query,
    queryFn: ({ signal }) =>
      lessonRequest<LessonLibraryPage>(`/api/admin/lessons/library?${params}`, {
        ...options.request,
        signal,
      }),
  });
  const refresh = async () => {
    await client.invalidateQueries({
      predicate: (q) =>
        ["/api/admin/lessons", "/api/lessons", "/api/chapters"].includes(String(q.queryKey[0])),
    });
  };
  async function edit(id: string) {
    if (busy) return;
    const current = session.capture();
    setBusy(true);
    setError("");
    try {
      const response = await lessonRequest<{ lesson: LessonAdmin }>(
        `/api/admin/lessons/${id}`,
        options.request,
      );
      if (current()) setEditing(response.lesson);
    } catch (e) {
      if (current()) setError(lessonError(e, "admin"));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function reorder(id: string, direction: number) {
    if (!query.data || busy || !chapterId) return;
    const current = session.capture();
    setBusy(true);
    setError("");
    try {
      // Reorder the complete selected chapter, never only a filtered/paged slice.
      const all = await lessonRequest<{ items: LessonSummary[] }>(
        `/api/admin/lessons?chapterId=${encodeURIComponent(chapterId)}`,
        options.request,
      );
      if (!current()) return;
      const items = [...all.items],
        index = items.findIndex((item) => item.id === id),
        target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return;
      if (items[index].version !== query.data.items.find((item) => item.id === id)?.version)
        throw new Error("LESSON_ORDER_CHANGED");
      [items[index], items[target]] = [items[target], items[index]];
      await lessonRequest("/api/admin/lessons/reorder", {
        ...adminMutationOptions("lesson-reorder", session.identity).request,
        method: "POST",
        body: JSON.stringify({
          chapterId,
          lessons: items.map((item, displayOrder) => ({
            id: item.id,
            version: item.version,
            displayOrder,
          })),
        }),
      });
      if (current()) {
        setNotice("Lesson order saved.");
        await refresh();
      }
    } catch (e) {
      if (current())
        setError(
          e instanceof Error && e.message === "LESSON_ORDER_CHANGED"
            ? "This lesson changed. Refresh the inventory before reordering."
            : lessonError(e, "admin"),
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  if (editing)
    return (
      <LessonEditor
        key={typeof editing === "string" ? "new" : editing.id}
        original={editing === "new" ? null : editing}
        chapters={chapters}
        initialChapterId={chapterId}
        onClose={() => {
          setEditing(null);
          requestAnimationFrame(() => document.getElementById("lesson-library-title")?.focus());
        }}
        onSaved={async () => {
          // Keep the editor mounted after its first POST so success feedback,
          // draft state and subsequent PUT requests retain the saved identity.
          setNotice("Lesson saved.");
          await refresh();
        }}
      />
    );
  return (
    <section className="lesson-admin">
      <header className="lesson-admin-header">
        <div>
          <p className="eyebrow">{translateUi("Official learning content")}</p>
          <h1 id="lesson-library-title" tabIndex={-1}>
            {translateUi("Lesson studio")}</h1>
          <p>
            {translateUi("Author structured lessons in existing chapters. Drafts are visible only to administrators.")}</p>
        </div>
        <button type="button" onClick={() => setEditing("new")}>
          {translateUi("Create lesson")}</button>
      </header>
      {query.data?.summary && (
        <dl className="lesson-studio-metrics">
          {Object.entries({
            "Total lessons": query.data.summary.total,
            Published: query.data.summary.published,
            "Drafts (including unpublished)": query.data.summary.drafts,
            "Chapters with lessons": query.data.summary.chapters,
          }).map(([label, count]) => (
            <div key={label}>
              <dt><UiMessage text={String(label)}/></dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="lesson-library-filters">
        <label>
          {translateUi("Search lessons")}<input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={translateUi("Title, description, chapter, domain or lesson ID")}
          />
        </label>
        <RelationshipFilter
          label={translateUi("Domain")}
          value={domainId}
          options={curriculum.data?.domains.map((d) => ({ id: d.id, title: d.title })) ?? []}
          onChange={(value) => {
            setDomainId(value);
            setChapterId("");
            setPage(1);
          }}
        />
        <RelationshipFilter
          label={translateUi("Chapter")}
          value={chapterId}
          options={chapters.filter((ch) => !domainId || ch.domainId === domainId)}
          onChange={(value) => {
            setChapterId(value);
            setPage(1);
          }}
        />
        <label>
          {translateUi("Status")}<select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{translateUi("All statuses")}</option>
            <option value="PUBLISHED">{translateUi("Published")}</option>
            <option value="DRAFT">{translateUi("Draft / unpublished")}</option>
          </select>
        </label>
        <label>
          {translateUi("Volume")}<select
            value={volume}
            onChange={(e) => {
              setVolume(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{translateUi("All volumes")}</option>
            <option value="V1">{translateUi("Volume 1")}</option>
            <option value="V2">{translateUi("Volume 2")}</option>
          </select>
        </label>
        <label>
          {translateUi("Updated on or after (UTC)")}<input
            type="date"
            value={updatedAfter}
            onChange={(e) => {
              setUpdatedAfter(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setDebounced("");
            setDomainId("");
            setChapterId("");
            setStatus("");
            setVolume("");
            setUpdatedAfter("");
            setPage(1);
          }}
        >
          {translateUi("Clear filters")}</button>
      </div>
      {notice && <p role="status"><UiMessage text={notice}/></p>}
      {error && <p role="alert"><UiMessage text={error}/></p>}
      {query.isPending ? (
        <p role="status">{translateUi("Loading lesson inventory…")}</p>
      ) : query.error || curriculum.error ? (
        <div role="alert">
          <p><UiMessage text={lessonError(query.error || curriculum.error, query.error ? "library" : "admin")}/></p>
          <button
            onClick={() => {
              void query.refetch();
              void curriculum.refetch();
            }}
          >
            {translateUi("Retry")}</button>
        </div>
      ) : !query.data?.items.length ? (
        <div className="lesson-state">
          <h2>{query.data?.summary?.total ? translateUi("No matching lessons") : translateUi("No lessons yet")}</h2>
          <p>
            {translateUi("Create a draft for an existing chapter or adjust the filters. Nothing is published automatically.")}</p>
        </div>
      ) : (
        <LessonLibraryListing
          items={query.data.items}
          busy={busy}
          canReorder={!!chapterId}
          edit={edit}
          reorder={reorder}
          onDeleted={refresh}
        />
      )}
      {query.data && (
        <nav className="lesson-library-pagination" aria-label={translateUi("Lesson library pages")}>
          <label>
            {translateUi("Lessons per page")}<select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}><UiMessage text={String(size)}/></option>
              ))}
            </select>
          </label>
          <span role="status">
            {translateUi("Page")}{" "}{page} · {query.data.total ?? query.data.items.length} {translateUi("matching lessons")}</span>
          <button
            disabled={page === 1 || query.isFetching || busy}
            onClick={() => setPage(page - 1)}
          >
            {translateUi("Previous page")}</button>
          <button
            disabled={page * pageSize >= (query.data.total ?? 0) || query.isFetching || busy}
            onClick={() => setPage(page + 1)}
          >
            {translateUi("Next page")}</button>
        </nav>
      )}
      {!chapterId && !!query.data?.items.length && (
        <p className="lesson-help">{translateUi("Filter to one chapter to reorder its lessons.")}</p>
      )}
    </section>
  );
}

function LessonLibraryListing({
  items,
  busy,
  canReorder,
  edit,
  reorder,
  onDeleted,
}: {
  items: LessonLibraryItem[];
  busy: boolean;
  canReorder: boolean;
  edit: (id: string) => Promise<void>;
  reorder: (id: string, direction: number) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const domains = [...new Set(items.map((item) => item.domainId))];
  return (
    <div className="lesson-library-groups">
      {domains.map((domainId) => {
        const domainItems = items.filter((item) => item.domainId === domainId),
          chapterIds = [...new Set(domainItems.map((item) => item.chapterId))];
        return (
          <details open key={domainId ?? "domain"}>
            <summary>
              {domainItems[0].domainName || translateUi("Curriculum domain")}{" "}
              <small>{domainItems.length} {translateUi("on this page")}</small>
            </summary>
            {chapterIds.map((id) => {
              const lessons = domainItems.filter((item) => item.chapterId === id);
              return (
                <details open key={id}>
                  <summary>{lessons[0].chapterTitle || translateUi("Chapter lessons")}</summary>
                  <ol className="lesson-catalog">
                    {lessons.map((lesson) => (
                      <li key={lesson.id}>
                        <div>
                          <h2>{lesson.title}</h2>
                          <small>
                            <UiMessage text={lesson.status}/> · {lesson.estimatedMinutes} {translateUi("min · Order")}{" "}
                            {lesson.displayOrder}
                            {lesson.publishedRevisionNumber
                              ? translateUi(' · Published revision {value0}',{value0:String(lesson.publishedRevisionNumber)})
                              : ""}
                          </small>
                          <p>{lesson.description}</p>
                          <small>
                            {translateUi("Updated")}{" "}
                            {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                              new Date(lesson.updatedAt),
                            )}
                          </small>
                          <p>
                            <Link href={`/learn/chapters/${lesson.chapterId}`}>
                              {translateUi("Open curriculum chapter")}</Link>
                            {lesson.status === "PUBLISHED" && (
                              <>
                                {" "}
                                ·{" "}
                                <Link
                                  href={`/learn/chapters/${lesson.chapterId}/lessons/${lesson.id}`}
                                >
                                  {translateUi("Read published lesson")}</Link>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="lesson-row-actions">
                          <button disabled={busy} onClick={() => void edit(lesson.id)}>
                            {translateUi("Edit / preview")}</button>
                          <LessonDeleteControl lesson={lesson} disabled={busy} onDeleted={onDeleted}/>
                          <button
                            disabled={!canReorder || busy}
                            aria-label={translateUi("Move {value0} earlier", {value0: String(lesson.title)})}
                            onClick={() => void reorder(lesson.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            disabled={!canReorder || busy}
                            aria-label={translateUi("Move {value0} later", {value0: String(lesson.title)})}
                            onClick={() => void reorder(lesson.id, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                </details>
              );
            })}
          </details>
        );
      })}
    </div>
  );
}

function LessonEditor({
  original,
  chapters,
  initialChapterId,
  onClose,
  onSaved,
}: {
  original: LessonAdmin | null;
  chapters: { id: string; title: string }[];
  initialChapterId: string;
  onClose: () => void;
  onSaved: (saved: LessonAdmin) => Promise<void>;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const session = useAdminSession(),
    [saved, setSaved] = useState(original);
  const history = useLessonHistory<LessonInput>(() => ({
    chapterId: original?.chapterId || initialChapterId,
    title: original?.title || "",
    description: original?.description || "",
    objectives: original?.objectives || [],
    estimatedMinutes: original?.estimatedMinutes || 5,
    blocks: original?.blocks || [],
    displayOrder: original?.displayOrder || 0,
  }));
  const form = history.value;
  const [insertAt, setInsertAt] = useState(-1);
  const [activeBlock, setActiveBlock] = useState<string | null>(original?.blocks[0]?.id ?? null);
  const [baseline, setBaseline] = useState(() =>
      JSON.stringify({
        chapterId: original?.chapterId || initialChapterId,
        title: original?.title || "",
        description: original?.description || "",
        objectives: original?.objectives || [],
        estimatedMinutes: original?.estimatedMinutes || 5,
        blocks: original?.blocks || [],
        displayOrder: original?.displayOrder || 0,
      }),
    ),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [metadataOpen, setMetadataOpen] = useState(!original),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<{ path: string; message: string }[]>([]),
    [status, setStatus] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  const dirty = JSON.stringify(form) !== baseline;
  const saving = useRef(false);
  useEffect(() => {
    if (fieldErrors.length) setMetadataOpen(true);
  }, [fieldErrors]);
  const inlineErrors = (prefix: string) =>
    fieldErrors
      .filter((issue) => issue.path === prefix || issue.path.startsWith(prefix + "."))
      .map((issue, index) => (
        <small role="note" className="lesson-field-error" key={index}>
          {issue.message}
        </small>
      ));
  const revisions = useQuery({
    ...adminQueryOptions(["/api/admin/lessons", saved?.id, "revisions"], session.identity).query,
    enabled: !!saved?.id,
    queryFn: ({ signal }) =>
      lessonRequest<{ items: LessonRevision[] }>(`/api/admin/lessons/${saved!.id}/revisions`, {
        signal,
      }),
  });
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      const link = (e.target as Element)?.closest?.("a[href]");
      if (
        link &&
        !link.getAttribute("href")?.startsWith("#") &&
        !window.confirm("Discard unsaved lesson changes?")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  const close = () => {
    if (!busy && (!dirty || window.confirm("Discard unsaved lesson changes?"))) onClose();
  };
  const update = (patch: Partial<LessonInput>) => {
    if (!saving.current) history.update(patch);
  };
  async function persist(action: "save" | "publish" | "unpublish") {
    if (saving.current) return;
    saving.current = true;
    setError("");
    setFieldErrors([]);
    setStatus("");
    const current = session.capture();
    setBusy(true);
    try {
      let result = saved;
      const request = adminMutationOptions(`lesson-${action}`, session.identity).request;
      if (action === "save") {
        const response = await lessonRequest<{ lesson: LessonAdmin }>(
          saved ? `/api/admin/lessons/${saved.id}` : "/api/admin/lessons",
          {
            ...request,
            method: saved ? "PUT" : "POST",
            body: JSON.stringify({ ...form, ...(saved ? { version: saved.version } : {}) }),
          },
        );
        result = response.lesson;
      } else {
        if (!saved || dirty) throw new Error("Save changes before changing publication.");
        const response = await lessonRequest<{ lesson: LessonAdmin }>(
          `/api/admin/lessons/${saved.id}/${action}`,
          { ...request, method: "POST", body: JSON.stringify({ version: saved.version }) },
        );
        result = response.lesson;
      }
      if (current() && result) {
        setSaved(result);
        setBaseline(JSON.stringify(form));
        await onSaved(result);
        setStatus(
          action === "save"
            ? "Saved. Existing published content changes only when you publish."
            : action === "publish"
              ? "Published lesson revision."
              : "Unpublished. Learners can no longer open this lesson.",
        );
      }
    } catch (e) {
      if (current()) {
        const value = e as {
          status?: number;
          data?: { error?: { details?: { path: string; message: string }[] } };
        };
        if (Array.isArray(value?.data?.error?.details)) setFieldErrors(value.data.error.details);
        setError(
          value?.status === 409
            ? "Another administrator changed this lesson. Close and refresh the list before editing again. Your unsaved text remains here for copying."
            : e instanceof Error && e.message === "Save changes before changing publication."
              ? e.message
              : lessonError(e, "admin"),
        );
      }
    } finally {
      saving.current = false;
      if (current()) setBusy(false);
    }
  }
  return (
    <LessonFormatProvider>
      <section className="lesson-studio-workspace" aria-labelledby="lesson-studio-title">
        <header className="lesson-studio-actionbar">
          <div className="lesson-studio-heading">
            <button type="button" onClick={close} disabled={busy}>
              {translateUi("Back to lesson library")}</button>
            <h1 id="lesson-studio-title" title={form.title} tabIndex={-1} ref={titleRef}>
              {form.title.trim() || (saved ? translateUi("Edit official lesson") : translateUi("Create official lesson"))}
            </h1>
            <span role="status">
              {dirty ? translateUi("Unsaved changes") : saved ? translateUi("Saved draft") : translateUi("New draft")}
              {saved?.status === "PUBLISHED" ? translateUi("· Published revision preserved") : ""}
            </span>
          </div>
          <div className="lesson-studio-actions" role="group" aria-label={translateUi("Lesson actions")}>
            <button
              type="submit"
              form="lesson-draft-form"
              disabled={busy || !form.chapterId || !form.title.trim()}
            >
              {busy ? translateUi("Saving lesson…") : translateUi("Save draft changes")}
            </button>
            <button
              type="button"
              disabled={busy || !saved || dirty || form.blocks.length === 0}
              onClick={() => {
                if (window.confirm("Publish this saved draft as a new lesson revision?"))
                  void persist("publish");
              }}
            >
              {translateUi("Publish revision")}</button>
            <button
              type="button"
              disabled={busy || !saved || dirty || saved.status !== "PUBLISHED"}
              onClick={() => {
                if (window.confirm("Unpublish this lesson? Learners will lose access immediately."))
                  void persist("unpublish");
              }}
            >
              {translateUi("Unpublish")}</button>
          </div>
        </header>
        <div className="lesson-studio-viewbar">
          <p>{translateUi("Draft workspace. Changes reach students only when you publish a revision.")}</p>
          <div role="group" aria-label={translateUi("Workspace view")} className="lesson-studio-view-switch">
            <button
              type="button"
              aria-pressed={!preview}
              aria-controls="lesson-editor-pane"
              onClick={() => setPreview(false)}
            >
              {translateUi("Editor")}</button>
            <button
              type="button"
              aria-pressed={preview}
              aria-controls="lesson-preview-pane"
              onClick={() => setPreview(true)}
            >
              {translateUi("Preview lesson")}</button>
          </div>
          <div role="group" aria-label={translateUi("Draft history")}>
            <button type="button" disabled={busy || !history.canUndo} onClick={history.undo}>
              {translateUi("Undo")}</button>
            <button type="button" disabled={busy || !history.canRedo} onClick={history.redo}>
              {translateUi("Redo")}</button>
          </div>
        </div>
        {error && <p role="alert"><UiMessage text={error}/></p>}
        {fieldErrors.length > 0 && (
          <ul className="lesson-field-errors" role="alert">
            {fieldErrors.map((issue, index) => (
              <li key={index}>
                <strong>{issue.path || translateUi("Lesson")}</strong>: {issue.message}
              </li>
            ))}
          </ul>
        )}
        {status && <p role="status">{status}</p>}
        <div className="visual-lesson-workspace" data-mobile-view={preview ? "preview" : "editor"}>
          <aside
            id="lesson-preview-pane"
            tabIndex={0}
            className="visual-preview-pane"
            aria-label={translateUi("Live student preview")}
          >
            <p className="visual-preview-label">
              {translateUi("Live student preview · local, unsaved content · no progress recorded")}</p>
            <article className="lesson-prose" dir="auto">
              <h1>{form.title || translateUi("Untitled lesson")}</h1>
              <p>{form.description}</p>
              <ul>
                {form.objectives.map((objective, index) => (
                  <li key={index}>{objective}</li>
                ))}
              </ul>
              <LessonContent blocks={form.blocks} />
            </article>
          </aside>
          <section
            id="lesson-editor-pane"
            className="visual-editor-pane"
            aria-label={translateUi("Lesson editing controls")}
            tabIndex={0}
          >
            <div inert={busy} aria-disabled={busy} className="lesson-shared-format">
              <Suspense fallback={<p role="status">{translateUi("Loading formatting controls...")}</p>}>
                <LessonFormattingToolbar />
              </Suspense>
            </div>
            <form
              id="lesson-draft-form"
              onInvalidCapture={(event) => {
                // The submit button stays outside the mobile panes. Reveal a
                // collapsed/hidden invalid field before native focus recovery.
                setPreview(false);
                setMetadataOpen(true);
                const field = event.target as HTMLElement;
                requestAnimationFrame(() => field.focus());
              }}
              inert={busy}
              aria-busy={busy}
              onSubmit={(e) => {
                e.preventDefault();
                void persist("save");
              }}
              className="lesson-fields"
            >
              <details
                className="lesson-studio-metadata"
                open={metadataOpen}
                onToggle={(e) => setMetadataOpen(e.currentTarget.open)}
              >
                <summary>{translateUi("Lesson setup and metadata")}</summary>
                <div className="lesson-studio-metadata-fields">
                  <RelationshipFilter
                    label={translateUi("Chapter")}
                    value={form.chapterId}
                    options={chapters}
                    onChange={(chapterId) => update({ chapterId })}
                  />
                  {!form.chapterId && <small>{translateUi("Choose an existing chapter before saving.")}</small>}
                  {inlineErrors("chapterId")}
                  <label>
                    {translateUi("Lesson title")}<input
                      required
                      dir="auto"
                      maxLength={180}
                      value={form.title}
                      onChange={(e) => update({ title: e.target.value })}
                    />
                    {inlineErrors("title")}
                  </label>
                  <label>
                    {translateUi("Description")}<textarea
                      dir="auto"
                      maxLength={4000}
                      value={form.description}
                      onChange={(e) => update({ description: e.target.value })}
                    />
                    {inlineErrors("description")}
                  </label>
                  <label>
                    {translateUi("Learning objectives (one per line)")}<textarea
                      dir="auto"
                      value={form.objectives.join("\n")}
                      onChange={(e) => update({ objectives: e.target.value.split("\n") })}
                    />
                    {inlineErrors("objectives")}
                  </label>
                  <label>
                    {translateUi("Estimated reading minutes")}<input
                      type="number"
                      required
                      min={1}
                      max={600}
                      value={form.estimatedMinutes}
                      onChange={(e) => update({ estimatedMinutes: Number(e.target.value) })}
                    />
                    {inlineErrors("estimatedMinutes")}
                  </label>
                </div>
              </details>
              <div className="lesson-blocks-editor">
                <h2>{translateUi("Content sections")}</h2>
                {!!form.blocks.length && (
                  <details className="lesson-outline-disclosure">
                    <summary>{translateUi("Content outline (")}{form.blocks.length} {translateUi("blocks)")}</summary>
                    <nav aria-label={translateUi("Lesson outline")} className="lesson-author-outline">
                      {form.blocks.map((block, index) => (
                        <a
                          key={block.id}
                          href={`#edit-block-${block.id}`}
                          onClick={() => setActiveBlock(block.id)}
                        >
                          {index + 1}. {blockNames[block.type]}
                          {"text" in block && block.text ? " · " + block.text.slice(0, 60) : ""}
                        </a>
                      ))}
                    </nav>
                  </details>
                )}
                <p className="lesson-help">
                  {translateUi("Use headings to build the reading table of contents. Paragraphs preserve line breaks. Styling is controlled by the platform for consistent, safe reading.")}</p>
                {form.blocks.map((block, index) => (
                  <fieldset
                    className="lesson-block-editor"
                    key={block.id}
                    data-block-type={block.type}
                    id={`edit-block-${block.id}`}
                  >
                    <legend>
                      {index + 1}. {blockNames[block.type]}
                    </legend>
                    <details
                      open={activeBlock === block.id}
                      onToggle={(event) => {
                        if (event.currentTarget.open) setActiveBlock(block.id);
                        else setActiveBlock((current) => (current === block.id ? null : current));
                      }}
                    >
                      <summary>{translateUi("Edit / collapse section")}{" "}{index + 1}</summary>
                      {activeBlock === block.id && (
                        <BlockEditor
                          block={block}
                          previousBlocks={form.blocks.slice(0, index)}
                          update={(next) =>
                            update({
                              blocks: form.blocks.map((item) =>
                                item.id === block.id ? next : item,
                              ),
                            })
                          }
                        />
                      )}
                    </details>
                    {inlineErrors(`blocks.${index}`)}
                    <details className="lesson-block-actions">
                      <summary>{translateUi("Section actions")}</summary>
                      <div className="lesson-row-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setInsertAt(index);
                            document.getElementById("lesson-add-block")?.focus();
                          }}
                        >
                          {translateUi("Add before")}</button>
                        <button
                          type="button"
                          onClick={() => {
                            setInsertAt(index + 1);
                            document.getElementById("lesson-add-block")?.focus();
                          }}
                        >
                          {translateUi("Add after")}</button>
                        <button
                          type="button"
                          disabled={form.blocks.length >= 200}
                          onClick={() =>
                            update({
                              blocks: [
                                ...form.blocks.slice(0, index + 1),
                                duplicateLessonBlock(block),
                                ...form.blocks.slice(index + 1),
                              ],
                            })
                          }
                        >
                          {translateUi("Duplicate section")}</button>
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={translateUi("Move section {value0} earlier", {value0: String(index + 1)})}
                          onClick={() =>
                            update({ blocks: moveLessonBlock(form.blocks, index, -1) })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === form.blocks.length - 1}
                          aria-label={translateUi("Move section {value0} later", {value0: String(index + 1)})}
                          onClick={() => update({ blocks: moveLessonBlock(form.blocks, index, 1) })}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Remove this section from the draft?"))
                              update({
                                blocks: form.blocks.filter((item) => item.id !== block.id),
                              });
                          }}
                        >
                          {translateUi("Remove section")}</button>
                      </div>
                    </details>
                  </fieldset>
                ))}
                <label>
                  {translateUi("Add content block")}<select
                    id="lesson-add-block"
                    disabled={form.blocks.length >= 200}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        const created = newLessonBlock(e.target.value as LessonBlock["type"]);
                        setActiveBlock(created.id);
                        update({
                          blocks: [
                            ...form.blocks.slice(0, insertAt < 0 ? form.blocks.length : insertAt),
                            created,
                            ...form.blocks.slice(insertAt < 0 ? form.blocks.length : insertAt),
                          ],
                        });
                      }
                      setInsertAt(-1);
                    }}
                  >
                    <option value="">{translateUi("Choose a block type…")}</option>
                    {[
                      [
                        "Text and structure",
                        ["richText", "paragraph", "heading", "quote", "list", "callout"],
                      ],
                      ["Visual references", ["image", "diagram", "table", "code"]],
                      ["Learning activities", ["knowledgeCheck", "labReference"]],
                    ].map(([group, types]) => (
                      <optgroup key={group as string} label={group as string}>
                        {(types as LessonBlock["type"][]).map((type) => (
                          <option key={type} value={type}>
                            {blockNames[type]}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <small>
                  {insertAt < 0
                    ? translateUi("New blocks append at the end.")
                    : translateUi("New block will be inserted at position {value0}.", {value0: String(insertAt + 1)})}
                </small>
              </div>
            </form>
            {saved && (
              <details className="lesson-revisions">
                <summary>{translateUi("Immutable revision history")}</summary>
                {revisions.isPending ? (
                  <p>{translateUi("Loading revisions…")}</p>
                ) : revisions.error ? (
                  <p role="alert">
                    {translateUi("Revision history could not load.")}{" "}
                    <button onClick={() => void revisions.refetch()}>{translateUi("Retry")}</button>
                  </p>
                ) : (
                  <ul>
                    {revisions.data?.items.map((revision) => (
                      <li key={revision.id}>
                        {translateUi("Revision")}{" "}{revision.revisionNumber} ·{" "}
                        <DateText value={revision.createdAt} options={{dateStyle:'medium',timeStyle:'short'}}/>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            )}
          </section>
        </div>
      </section>
    </LessonFormatProvider>
  );
}
