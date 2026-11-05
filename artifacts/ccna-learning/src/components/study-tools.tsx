import { UiMessage, DateText } from '../i18n';
import { useI18n } from '../i18n';
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  lessonRequest,
  getStudyLesson,
  getStudyWorkspace,
  getStudyProgress,
  type LessonPublished,
  type StudyAnnotation,
  type StudyAnnotationInput,
  type StudyAnnotationPatch,
  type StudyProgressInput,
  type CurriculumSummary,
} from "@workspace/api-client-react";
import { useNexusIdentity } from "../lib/nexus";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { validAnchor, completionPercent, type TextAnchor } from "../../../../lib/lesson-study";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "./ui/sheet";
import "../study.css";
import "../study-hub.css";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { readingScrollRoot, type ReadingPosition } from "../lib/reading-position";
const StudyExportPanel = lazy(() => import("./study-export-panel").then(module=>({default:module.StudyExportPanel})));
const colors = ["yellow", "green", "blue", "pink"] as const;
function studyError(error: unknown) {
  return (
    (error as { data?: { error?: { message?: string } } })?.data?.error?.message ??
    "Study tools could not load. Retry without discarding your unsaved note."
  );
}
export function useLessonStudy(lesson?: LessonPublished) {
  const identity = useNexusIdentity(),
    client = useQueryClient(),
    key =
      identity && lesson
        ? identity.userId + ":" + identity.sessionId + ":" + lesson.id + ":" + lesson.revisionId
        : "";
  const currentKey = useRef(key),
    pendingKeys = useRef(new Set<string>());
  currentKey.current = key;
  const [message, setMessage] = useState<{ key: string; text: string }>({ key: "", text: "" }),
    [busyKey, setBusyKey] = useState("");
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/study", lesson?.id, lesson?.revisionId], identity),
    enabled: !!identity && !!lesson,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      getStudyLesson(lesson!.id, { signal, cache: "no-store", credentials: "same-origin" }),
  });
  const ready =
    !!lesson &&
    query.data?.revisionId === lesson.revisionId &&
    Array.isArray(query.data?.annotations);
  const annotations = ready ? query.data!.annotations : [];
  const highlights = annotations.filter(
    (a) =>
      a.kind === "HIGHLIGHT" &&
      a.revisionId === lesson?.revisionId &&
      a.anchor &&
      validAnchor(a.anchor, lesson.blocks),
  );
  const [selection, setSelection] = useState<{
    key: string;
    anchor: TextAnchor;
    left: number;
    top: number;
  } | null>(null);
  async function mutate(path: string, method: string, body: unknown) {
    if (!identity || !ready || pendingKeys.current.has(key)) return false;
    pendingKeys.current.add(key);
    const capture = key;
    setBusyKey(key);
    setMessage({ key, text: "" });
    try {
      await lessonRequest(path, {
        method,
        headers: { "X-Study-Session": identity.sessionId },
        body: JSON.stringify(body),
      });
      if (currentKey.current !== capture) return false;
      await client.invalidateQueries({ predicate: (q) => q.queryKey[0] === "/api/study" });
      setMessage({ key, text: "Saved to your private study workspace." });
      return true;
    } catch (error) {
      if (currentKey.current === capture) setMessage({ key, text: studyError(error) });
      return false;
    } finally {
      pendingKeys.current.delete(capture);
      setBusyKey((previous) => (previous === capture ? "" : previous));
    }
  }
  const create = (
    value: Pick<StudyAnnotationInput, "kind"> &
      Partial<Pick<StudyAnnotationInput, "anchor" | "body" | "color" | "category">>,
  ) =>
    mutate("/api/study/annotations", "POST", {
      lessonId: lesson!.id,
      revisionId: lesson!.revisionId,
      anchor: null,
      body: "",
      color: null,
      category: "",
      ...value,
    });
  const progress = query.data?.progress ?? {
    state: "NOT_STARTED" as const,
    blockId: null,
    version: 0,
  };
  return {
    key,
    query,
    ready,
    annotations,
    highlights,
    progress,
    busy: busyKey === key,
    message: message.key === key ? message.text : "",
    selection: selection?.key === key ? selection : null,
    clearSelection: () => setSelection(null),
    create,
    change: (item: StudyAnnotation, patch: Omit<StudyAnnotationPatch, "version">) =>
      mutate("/api/study/annotations/" + item.id, "PATCH", { version: item.version, ...patch }),
    remove: (item: StudyAnnotation) =>
      mutate("/api/study/annotations/" + item.id, "DELETE", { version: item.version }),
    progressAction: (action: StudyProgressInput["action"], blockId: string | null = null) =>
      mutate("/api/study/progress", "PUT", {
        lessonId: lesson!.id,
        revisionId: lesson!.revisionId,
        version: progress.version,
        action,
        blockId,
      }),
    bookmarkSection: (blockId: string) =>
      void create({ kind: "BOOKMARK", anchor: { blockId, start: 0, end: 0, quote: "" } }),
    captureSelection: () => {
      setSelection(null);
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !lesson) return;
      const range = selection.getRangeAt(0),
        element = (
          range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : (range.startContainer as Element)
        )?.closest<HTMLElement>("[data-study-text]");
      if (!element || !element.contains(range.endContainer) || !element.closest(".lesson-prose"))
        return;
      const prefix = range.cloneRange();
      prefix.selectNodeContents(element);
      prefix.setEnd(range.startContainer, range.startOffset);
      const start = prefix.toString().length,
        quote = range.toString(),
        anchor = { blockId: element.dataset.studyText!, start, end: start + quote.length, quote };
      if (!quote.trim() || quote.length > 5000 || !validAnchor(anchor, lesson.blocks)) return;
      const rect =
        typeof range.getBoundingClientRect === "function"
          ? range.getBoundingClientRect()
          : { left: 20, bottom: 100 };
      setSelection({
        key,
        anchor,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 290)),
        top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 155)),
      });
    },
  };
}
export type LessonStudy = ReturnType<typeof useLessonStudy>;
export function revealActiveStudySection(outline: HTMLElement) {
  const active=outline.querySelector<HTMLElement>('a[aria-current="location"]');
  if(!active)return;
  const scroller=readingScrollRoot(active);
  // Ignore application/page scrollers even when the outline is hidden or fits.
  if(!scroller || !scroller.closest(".study-hub,.study-hub-drawer,.lesson-toc"))return;
  const viewport=scroller.getBoundingClientRect(),item=active.getBoundingClientRect();
  const top=viewport.top+scroller.clientTop+8,bottom=viewport.top+scroller.clientTop+scroller.clientHeight-8;
  if(item.top<top)scroller.scrollTop+=item.top-top;
  else if(item.bottom>bottom)scroller.scrollTop+=item.bottom-bottom;
}
function StudyOutline({children,active,headingId}:{children:ReactNode;active:boolean;headingId?:string|null}) {
  const ref=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{if(active&&ref.current)revealActiveStudySection(ref.current);},[active,headingId]);
  return <div ref={ref}>{children}</div>;
}

function StudyHubFrame({children,reveal}:{children:ReactNode;reveal:boolean}) {
  const { t: translateUi } = useI18n();
  const [mobile,setMobile]=useState(()=>typeof window!=="undefined" && window.matchMedia?.("(max-width: 1100px)").matches),[open,setOpen]=useState(false);
  useEffect(()=>{const media=window.matchMedia?.("(max-width: 1100px)");if(!media)return;const changed=()=>setMobile(media.matches);media.addEventListener("change",changed);return()=>media.removeEventListener("change",changed);},[]);
  useEffect(()=>{if(reveal&&mobile){setOpen(true);requestAnimationFrame(()=>document.getElementById("private-study-note")?.focus());}},[reveal,mobile]);
  const destination=useRef<string|null>(null);
  return mobile ? <Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><button type="button">{translateUi("Open Study Hub")}</button></SheetTrigger><SheetContent className="study-hub-drawer" onClick={event=>{
    const link=(event.target as Element).closest<HTMLAnchorElement>('a[href^="#section-"]');
    if(link){event.preventDefault();destination.current=link.hash.slice(1);setOpen(false);}
  }} onCloseAutoFocus={event=>{
    if(destination.current){event.preventDefault();const target=document.getElementById(destination.current);destination.current=null;target?.scrollIntoView({block:"start",behavior:"auto"});if(target){target.tabIndex=-1;target.focus({preventScroll:true});}}
  }}><SheetHeader><SheetTitle>{translateUi("Study Hub")}</SheetTitle><SheetDescription>{translateUi("Lesson outline, private materials and explicit progress.")}</SheetDescription></SheetHeader>{children}</SheetContent></Sheet> : <div className="study-hub">{children}</div>;
}

export function ReaderStudyTools({
  lesson,
  study,
  curriculum,
  currentPosition,
  outline,
}: {
  lesson: LessonPublished;
  study: LessonStudy;
  curriculum?: CurriculumSummary;
  currentPosition?: ReadingPosition;
  outline?: ReactNode;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const [body, setBody] = useState(""),
    [category, setCategory] = useState(""),
    [editing, setEditing] = useState<StudyAnnotation | null>(null),
    [anchor, setAnchor] = useState<TextAnchor | null>(null),
    [search, setSearch] = useState(""),
    [hubTab, setHubTab] = useState("outline"),
    [showAll, setShowAll] = useState(false);
  const available = study.ready && !study.busy;
  const identity = useNexusIdentity();
  const chapterProgress = useQuery({
    queryKey: sessionQueryKey(["/api/study", "hub-chapter", lesson.chapterId], identity),
    enabled: !!identity && study.ready,
    gcTime: 0, retry: false,
    queryFn: ({signal}) => getStudyProgress({chapterId: lesson.chapterId, page: 1, pageSize: 1}, {signal, cache:"no-store"}),
  });
  const chapterStatus = chapterProgress.data?.chapters.find(chapter=>chapter.chapterId===lesson.chapterId);

  useEffect(() => {
    if (!body.trim()) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.("a[href]");
      if (
        link &&
        !link.getAttribute("href")?.startsWith("#") &&
        !window.confirm("Discard this unsaved private note?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [body]);
  const items = study.annotations.filter((a) =>
    (a.body + " " + a.category + " " + (a.anchor?.quote ?? ""))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="reader-study-tools" aria-label={translateUi("Private study tools")}>

      {study.selection && (
        <div
          className="study-selection-toolbar"
          role="toolbar"
          aria-label={translateUi("Selected passage actions")}
          style={{ left: study.selection.left, top: study.selection.top }}
        >
          <span>{translateUi("Highlight selected text")}</span>
          <small>
            {translateUi("Yellow: important · Green: understood · Blue: review later · Pink: difficult. Colors do not change completion.")}</small>
          {colors.map((color) => (
            <button
              key={color}
              className={"study-color-" + color}
              type="button"
              disabled={!available}
              aria-label={translateUi("Highlight {value0}", {value0: localizeUiLabel(String(color))})}
              onClick={() =>
                void study
                  .create({ kind: "HIGHLIGHT", color, anchor: study.selection!.anchor })
                  .then((saved) => {
                    if (saved) study.clearSelection();
                  })
              }
            >
              {color}
            </button>
          ))}
          <button
            type="button"
            disabled={!available}
            onClick={() => {
              setHubTab("study");
              setAnchor(study.selection!.anchor);
              setEditing(null);
              requestAnimationFrame(() => document.getElementById("private-study-note")?.focus());
              study.clearSelection();
            }}
          >
            {translateUi("Add note")}</button>
          <button
            type="button"
            disabled={!available}
            onClick={() =>
              void study
                .create({ kind: "BOOKMARK", anchor: study.selection!.anchor })
                .then((saved) => {
                  if (saved) study.clearSelection();
                })
            }
          >
            {translateUi("Bookmark passage")}</button>
          <button type="button" onClick={study.clearSelection}>
            {translateUi("Dismiss")}</button>
        </div>
      )}
      <StudyHubFrame reveal={!!anchor||!!editing}>
      <header className="study-hub-heading"><h2>{translateUi("Study Hub")}</h2><p>{translateUi("Your lesson, your study materials.")}</p></header>
      <Tabs value={hubTab} onValueChange={setHubTab} className="study-hub-tabs">
        <TabsList aria-label={translateUi("Study Hub sections")}>
          <TabsTrigger value="outline">{translateUi("Outline")}</TabsTrigger>
          <TabsTrigger value="study">{translateUi("My Study")}</TabsTrigger>
          <TabsTrigger value="progress">{translateUi("Progress")}</TabsTrigger>
        </TabsList>
        <TabsContent value="outline" forceMount hidden={hubTab!=="outline"}>
          <StudyOutline active={hubTab==="outline"} headingId={currentPosition?.headingId}>{outline ?? <p>{translateUi("No section outline is available for this lesson.")}</p>}</StudyOutline>
        </TabsContent>
        <TabsContent value="progress" forceMount hidden={hubTab!=="progress"}>
        {study.query.isPending ? (
          <p role="status">{translateUi("Checking private study storage…")}</p>
        ) : study.query.isError ? (
          <div role="alert">
            <p>{studyError(study.query.error)}</p>
            <button type="button" onClick={() => void study.query.refetch()}>
              {translateUi("Retry study tools")}</button>
          </div>
        ) : !study.ready ? (
          <p role="status">
            {translateUi("Private study storage is unavailable. No personal study changes are being saved.")}</p>
        ) : (
          <>
            <p>
              {translateUi("Lesson completion:")}{" "}
              <strong>{study.progress.state.replaceAll("_", " ").toLowerCase()}</strong>
            </p>
            <p>{translateUi("Current reading position:")}{" "}{Math.round(currentPosition?.percent ?? 0)}%</p>
            <p>
              {translateUi("Saved reading position:")}{" "}
              {study.progress.blockId
                ? lesson.blocks.some((block) => block.id === study.progress.blockId)
                  ? translateUi("section {value0}", {value0: String(lesson.blocks.findIndex((block) => block.id === study.progress.blockId) + 1)})
                  : translateUi("section from an earlier revision")
                : translateUi("Not saved")}
              {translateUi(". Resume is section-based.")}</p>
            <div className="study-actions">
              {study.progress.state === "NOT_STARTED" ? (
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => void study.progressAction("start")}
                >
                  {translateUi("Start this lesson")}</button>
              ) : study.progress.state === "COMPLETED" ? (
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => void study.progressAction("reopen")}
                >
                  {translateUi("Reopen completed lesson")}</button>
              ) : (
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => void study.progressAction("complete")}
                >
                  {translateUi("Mark lesson completed")}</button>
              )}
              <button
                type="button"
                disabled={!available}
                onClick={() => void study.create({ kind: "BOOKMARK" })}
              >
                {translateUi("Bookmark lesson")}</button>
            </div>
            {study.progress.state === "NOT_STARTED" && <p>{translateUi("Saving a reading position also starts this lesson. It does not mark it completed.")}</p>}

          </>
        )}
        {chapterStatus ? <section className="study-progress-meter" aria-label={translateUi("Chapter completion")}>
          <h3>{translateUi("Chapter completion")}</h3><p>{chapterStatus.completed} {translateUi("of")}{" "}{chapterStatus.total} {translateUi("published lessons completed")}</p>
          <progress aria-label={translateUi("Chapter completion")} max={100} value={completionPercent(chapterStatus.completed,chapterStatus.total)}/>
        </section> : <div><p>{chapterProgress.isError ? translateUi("Chapter progress unavailable.") : study.ready ? translateUi("Loading chapter progress...") : translateUi("Chapter progress loads when private study tools are ready.")}</p>{chapterProgress.isError && <button type="button" onClick={()=>void chapterProgress.refetch()}>{translateUi("Retry chapter progress")}</button>}</div>}
        <p>{translateUi("Completion requires your explicit action. Reading position never marks a lesson complete.")}</p>
        </TabsContent>
        <TabsContent value="study" forceMount hidden={hubTab!=="study"}>
          {!study.ready && <div role="status"><p>{study.query.isError ? studyError(study.query.error) : translateUi("Loading your private study materials...")}</p>{study.query.isError && <button type="button" onClick={()=>void study.query.refetch()}>{translateUi("Retry private materials")}</button>}</div>}
          <div className="study-summary" aria-label={translateUi("Saved items in this lesson")}>
            {(["NOTE","HIGHLIGHT","BOOKMARK"] as const).map(kind=><div key={kind}><strong>{study.ready ? study.annotations.filter(item=>item.kind===kind).length : "?"}</strong><span>{kind==="NOTE"?translateUi("Notes"):kind==="HIGHLIGHT"?translateUi("Highlights"):translateUi("Bookmarks")}</span></div>)}
          </div>
          <p className="study-muted">{translateUi("This lesson, including materials saved on earlier revisions.")}</p>
          <div className="study-hub-actions"><StudyWorkspace curriculum={curriculum}/>
          <Suspense fallback={<p>{translateUi("Loading export tools...")}</p>}><StudyExportPanel chapterId={lesson.chapterId} lessonId={lesson.id} identityKey={study.key}/></Suspense></div>
        <details open={!!body || !!editing || !!anchor}>
          <summary>{translateUi("Private notes")}</summary>
          <label htmlFor="private-study-note">
            {editing
              ? translateUi("Edit private {value0}", {value0: localizeUiLabel(String(editing.kind.toLowerCase()))})
              : anchor
                ? translateUi("Note on selected text")
                : translateUi("General lesson note")}
          </label>
          {anchor && <blockquote>{anchor.quote || translateUi("Selected section")}</blockquote>}
          <textarea
            id="private-study-note"
            maxLength={10000}
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {body && <small>{translateUi("Unsaved note. Save explicitly before leaving this lesson.")}</small>}
          <label>
            {translateUi("Study item category")}<input maxLength={80} value={category} onChange={(e) => setCategory(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={!available || ((!editing || editing.kind === "NOTE") && !body.trim())}
            onClick={async () => {
              const saved = editing
                ? await study.change(editing, { body, category })
                : await study.create({ kind: "NOTE", body, category, anchor });
              if (saved) {
                setBody("");
                setCategory("");
                setEditing(null);
                setAnchor(null);
              }
            }}
          >
            {study.busy ? translateUi("Saving…") : translateUi("Save private note")}
          </button>
          {(editing || anchor) && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setAnchor(null);
                setBody("");
                setCategory("");
              }}
            >
              {translateUi("Cancel note edit")}</button>
          )}
        </details>
        {study.message && <p role="status">{study.message}</p>}
        <h3>{translateUi("Recent lesson materials")}</h3>
        <label>
          {translateUi("Find saved lesson items")}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <ul className="study-saved-items">
          {[...items].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,showAll ? items.length : 3).map((item) => (
            <li key={item.id}>
              <strong><UiMessage text={item.kind.toLowerCase()}/></strong>
              {item.revisionId !== lesson.revisionId ? (
                <p>{translateUi("Saved on an older revision; not applied to this text.")}</p>
              ) : (
                item.anchor && (
                  <a href={`#section-${item.anchor.blockId}`}>{translateUi("Go to passage / section")}</a>
                )
              )}
              <p>
                {item.body ||
                  item.anchor?.quote ||
                  (item.anchor ? translateUi("Section bookmark") : translateUi("Lesson bookmark"))}
              </p>
              {item.category && <small>{item.category}</small>}
              <details><summary>{translateUi("Manage this item")}</summary>
              {
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    setHubTab("study");
                    setEditing(item);
                    setBody(item.body);
                    setCategory(item.category);
                    setAnchor(item.anchor);
                  }}
                >
                  {translateUi("Edit")}{" "}<UiMessage text={item.kind.toLowerCase()}/>
                </button>
              }
              {
                <label>
                  {translateUi("Item color")}<select
                    value={item.color ?? ""}
                    disabled={!available}
                    onChange={(e) =>
                      void study.change(item, {
                        color: e.target.value ? (e.target.value as typeof item.color) : null,
                      })
                    }
                  >
                    {item.kind !== "HIGHLIGHT" && <option value="">{translateUi("None")}</option>}
                    {colors.map((color) => (
                      <option key={color} value={color}><UiMessage text={String(color)}/></option>
                    ))}
                  </select>
                </label>
              }
              <button
                type="button"
                disabled={!available}
                onClick={() => {
                  if (window.confirm("Delete only this private study item?"))
                    void study.remove(item);
                }}
              >
                {translateUi("Delete")}{" "}<UiMessage text={item.kind.toLowerCase()}/>
              </button>
              </details>
            </li>
          ))}
        </ul>
        {study.ready && !items.length && <p>{translateUi("No saved materials yet. Select a passage to highlight it, bookmark a section, or write a private note.")}</p>}
        {items.length>3 && <button type="button" onClick={()=>setShowAll(!showAll)}>{showAll?translateUi("Show recent items"):translateUi("Show all {value0} lesson items", {value0: String(items.length)})}</button>}
        </TabsContent>
      </Tabs>
      </StudyHubFrame>
    </section>
  );
}

export function StudyWorkspace({ curriculum }: { curriculum?: CurriculumSummary }) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const identity = useNexusIdentity(),
    [open, setOpen] = useState(false),
    [tab, setTab] = useState("NOTE"),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [color, setColor] = useState(""),
    [domain, setDomain] = useState(""),
    [chapter, setChapter] = useState(""),
    [lessonFilter, setLessonFilter] = useState(""),
    [sort, setSort] = useState("updated_desc"),
    [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = {
    q: debounced,
    ...(color ? { color: color as "yellow" } : {}),
    ...(domain ? { domainCode: domain as "1.0" } : {}),
    ...(chapter ? { chapterId: chapter } : {}),
    ...(lessonFilter ? { lessonId: lessonFilter } : {}),
    sort: sort as "updated_desc",
    page,
    pageSize: 25,
  };
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/study", "workspace", tab, params], identity),
    enabled: !!identity && open && tab !== "PROGRESS",
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      getStudyWorkspace({ ...params, kind: tab as "NOTE" }, { signal, cache: "no-store" }),
  });
  const progress = useQuery({
    queryKey: sessionQueryKey(["/api/study", "progress", params], identity),
    enabled: !!identity && open && tab === "PROGRESS",
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) => getStudyProgress(params, { signal, cache: "no-store" }),
  });
  const lessonChoices = useQuery({
    queryKey: sessionQueryKey(["/api/chapters", chapter, "lessons"], identity),
    enabled: !!identity && open && !!chapter, gcTime:0,retry:false,
    queryFn:({signal})=>lessonRequest<{items:{id:string;title:string}[]}>(`/api/chapters/${chapter}/lessons`,{signal}),
  });
  const summary = useQuery({
    queryKey: sessionQueryKey(["/api/study", "collection-counts", {q:debounced,color,domain,chapter,lessonFilter}], identity),
    enabled: !!identity && open, gcTime:0,retry:false,
    queryFn:({signal})=>Promise.all((["NOTE","HIGHLIGHT","BOOKMARK"] as const).map(kind=>getStudyWorkspace({...params,kind,page:1,pageSize:1},{signal,cache:"no-store"}).then(result=>({kind,total:result.total})))),
  });
  const clearFilters=()=>{setSearch("");setDebounced("");setColor("");setDomain("");setChapter("");setLessonFilter("");setSort("updated_desc");setPage(1);};
  const activeFilters=[search&&`Search: ${search}`,domain&&`Domain ${domain}`,chapter&&`Chapter: ${curriculum?.domains.flatMap(d=>d.sections.flatMap(s=>s.chapters)).find(c=>c.id===chapter)?.title??"Selected"}`,lessonFilter&&`Lesson: ${lessonChoices.data?.items.find(item=>item.id===lessonFilter)?.title??"Selected"}`,color&&`Color: ${color}`,sort!=="updated_desc"&&`Sort: ${sort.replaceAll("_"," ")}`].filter(Boolean);
  const selected = tab === "PROGRESS" ? progress : query;
  const chapters =
    curriculum?.domains
      .filter((d) => !domain || d.id === "d" + domain[0])
      .flatMap((d) => d.sections.flatMap((s) => s.chapters)) ?? [];
  const domainTotals =
    progress.data?.chapters.reduce<
      Record<string, { total: number; completed: number; name: string }>
    >((all, c) => {
      const value = all[c.domainCode] ?? { total: 0, completed: 0, name: c.domainName };
      value.total += c.total;
      value.completed += c.completed;
      all[c.domainCode] = value;
      return all;
    }, {}) ?? {};
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button">{translateUi("Open My Study Workspace")}</button>
      </SheetTrigger>
      <SheetContent className="study-workspace-sheet">
        <SheetHeader>
          <SheetTitle>{translateUi("My Study Workspace")}</SheetTitle>
          <SheetDescription>
            {translateUi("Private notes, highlights, bookmarks and explicit progress. Nothing is stored only in this browser.")}</SheetDescription>
        </SheetHeader>
        <div className="study-summary" aria-label={translateUi("Saved items in selected scope")}>
          {(["NOTE","HIGHLIGHT","BOOKMARK"] as const).map(kind=><button type="button" key={kind} onClick={()=>{setTab(kind);setPage(1);}}><strong>{summary.data?.find(item=>item.kind===kind)?.total ?? (summary.isError?translateUi("Unavailable"):"...")}</strong><span>{kind==="NOTE"?translateUi("Notes"):kind==="HIGHLIGHT"?translateUi("Highlights"):translateUi("Bookmarks")}</span></button>)}
        </div>
        <div role="tablist" aria-label={translateUi("Study collections")} className="study-tabs">
          {[
            ["NOTE", "My Notes"],
            ["HIGHLIGHT", "Highlights"],
            ["BOOKMARK", "Bookmarks"],
            ["PROGRESS", "Progress"],
          ].map(([key, label], i) => (
            <button
              role="tab"
              id={"study-tab-" + key}
              aria-controls="study-workspace-panel"
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              key={key}
              onClick={() => {
                setTab(key);
                setPage(1);
              }}
              onKeyDown={(event) => {
                const tabs = [
                  ...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                    "[role=tab]",
                  ),
                ];
                let target = i;
                const forward=getComputedStyle(event.currentTarget).direction==="rtl"?-1:1;
                if (event.key === "ArrowRight") target = (i + forward + tabs.length) % tabs.length;
                else if (event.key === "ArrowLeft") target = (i - forward + tabs.length) % tabs.length;
                else if (event.key === "Home") target = 0;
                else if (event.key === "End") target = tabs.length - 1;
                else return;
                event.preventDefault();
                tabs[target].click();
                tabs[target].focus();
              }}
            >
              <UiMessage text={String(label)}/>
            </button>
          ))}
        </div>
        <div className="study-workspace-search">

          <label>
            {translateUi("Search my study materials")}<input value={search} type="search" onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>
        <details className="study-advanced-filters"><summary>{translateUi("Advanced filters")}{activeFilters.length?` (${activeFilters.length})`:""}</summary><div className="study-workspace-filters">
          <label>
            {translateUi("Domain")}<select
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setChapter("");setLessonFilter("");
                setPage(1);
              }}
            >
              <option value="">{translateUi("All domains")}</option>
              {curriculum?.domains.map((d) => (
                <option key={d.id} value={d.id.replace(/^d([1-6])$/, "$1.0")}>
                  {d.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {translateUi("Chapter")}<select
              value={chapter}
              onChange={(e) => {
                setChapter(e.target.value);setLessonFilter("");
                setPage(1);
              }}
            >
              <option value="">{translateUi("All chapters")}</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label>{translateUi("Lesson")}<select value={lessonFilter} disabled={!chapter || lessonChoices.isPending} onChange={e=>{setLessonFilter(e.target.value);setPage(1);}}><option value="">{translateUi("All lessons")}</option>{lessonChoices.data?.items.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
          {tab !== "PROGRESS" && <label>{translateUi("Sort by date")}<select value={sort} onChange={e=>{setSort(e.target.value);setPage(1);}}>{[["updated_desc","Updated newest"],["updated_asc","Updated oldest"],["created_desc","Created newest"],["created_asc","Created oldest"]].map(([value,label])=><option key={value} value={value}><UiMessage text={String(label)}/></option>)}</select></label>}
          {tab !== "PROGRESS" && (
            <label>
              {translateUi("Color")}<select
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">{translateUi("All colors")}</option>
                {colors.map((c) => (
                  <option key={c} value={c}><UiMessage text={String(c)}/></option>
                ))}
              </select>
            </label>
          )}
        </div></details>
        {activeFilters.length>0 && <div className="study-active-filters" aria-label={translateUi("Active filters")}><ul>{activeFilters.map(value=><li key={String(value)}>{value}</li>)}</ul><button type="button" onClick={clearFilters}>{translateUi("Clear Filters")}</button></div>}
        <Suspense fallback={<p>{translateUi("Loading export tools...")}</p>}><StudyExportPanel chapterId={chapter||undefined} lessonId={lessonFilter||undefined} identityKey={identity ? identity.userId+":"+identity.sessionId : ""}/></Suspense>
        <section role="tabpanel" id="study-workspace-panel" aria-labelledby={"study-tab-" + tab}>
          {selected.isPending ? (
            <p role="status">{translateUi("Loading saved study materials…")}</p>
          ) : selected.isError ? (
            <div role="alert">
              <p>{studyError(selected.error)}</p>
              <button onClick={() => void selected.refetch()}>{translateUi("Retry workspace")}</button>
            </div>
          ) : tab === "PROGRESS" ? (
            <>
              <h2>{translateUi("Current published revisions")}</h2>
              <p>
                {translateUi("Chapter/domain totals include all published lessons in the selected scope. Search filters the lesson list below.")}</p>
              <section className="study-progress-meter" aria-label={translateUi("Selected scope completion")}>
                <h3>{translateUi("Selected scope")}</h3>
                <p>{Object.values(domainTotals).reduce((sum,c)=>sum+c.completed,0)} {translateUi("of")}{" "}{Object.values(domainTotals).reduce((sum,c)=>sum+c.total,0)} {translateUi("published lessons completed")}</p>
                <progress aria-label={translateUi("Selected scope completion")} max={100} value={completionPercent(Object.values(domainTotals).reduce((sum,c)=>sum+c.completed,0),Object.values(domainTotals).reduce((sum,c)=>sum+c.total,0))}/>
              </section>
              {Object.entries(domainTotals).map(([id,c])=><details key={id} className="study-progress-domain">
                <summary>{c.name} <span>{c.completed}/{c.total} {translateUi("completed")}</span></summary>
                <progress aria-label={translateUi("{value0} completion", {value0: String(c.name)})} max={100} value={completionPercent(c.completed,c.total)}/>
                {progress.data?.chapters.filter(ch=>ch.domainCode===id).map(ch=><details key={ch.chapterId} className="study-progress-chapter">
                  <summary>{ch.chapterTitle} <span>{ch.completed}/{ch.total} {translateUi("completed")}</span></summary>
                  <progress aria-label={translateUi("{value0} completion", {value0: String(ch.chapterTitle)})} max={100} value={completionPercent(ch.completed,ch.total)}/>
                  <p className="study-muted">{translateUi("Lessons on this page")}</p><ul>{progress.data?.lessons.filter(l=>l.chapterId===ch.chapterId).map(l=><li key={l.id}><Link href={`/learn/chapters/${l.chapterId}/lessons/${l.id}${l.blockId?"#section-"+l.blockId:""}`}>{l.title}</Link><span className="study-status">{l.state.replaceAll("_"," ").toLowerCase()}</span></li>)}</ul>
                </details>)}
              </details>)}
              {progress.data?.total === 0 && <p>{translateUi("No published lessons match these filters.")}</p>}
            </>
          ) : (
            <>
              <p>{query.data?.total ?? 0} {translateUi("matching saved items")}</p>
              {query.data?.items.map((item) => (
                <article key={item.id} className="study-workspace-item">
                  <div className="study-item-meta"><strong><UiMessage text={item.kind.toLowerCase()}/></strong><time dateTime={item.updatedAt}><DateText value={item.updatedAt} options={{dateStyle:'medium'}}/></time></div>
                  <small>
                    {item.domainName} → {item.chapterTitle}
                  </small>
                  <h2>{item.lessonTitle}</h2>
                  <small>{item.anchor ? (item.anchor.quote ? translateUi("Section excerpt: {value0}", {value0: String(item.anchor.quote)}) : translateUi("Bookmarked section")) : translateUi("Lesson-wide material")}</small>
                  <p>
                    {item.body ||
                      item.anchor?.quote ||
                      (item.anchor ? translateUi("Section bookmark") : translateUi("Lesson bookmark"))}
                  </p>
                  <small>
                    {item.category} {item.color && <span className={`study-color-label study-color-${item.color}`}>{item.color}</span>}
                  </small>
                  {item.revisionId !== item.currentRevisionId && (
                    <p>{translateUi("Older revision: this annotation is not attached to current text.")}</p>
                  )}
                  <Link
                    href={`/learn/chapters/${item.chapterId}/lessons/${item.lessonId}${item.anchor && item.revisionId === item.currentRevisionId ? "#section-" + item.anchor.blockId : ""}`}
                  >
                    {translateUi("Open original lesson")}</Link>
                  <small>{translateUi("Manage this private item in the original lesson.")}{" "}{item.anchor ? translateUi("Section-linked item") : translateUi("Lesson bookmark or general note")}</small>
                </article>
              ))}
              {query.data?.total === 0 && (
                <p>{translateUi("No saved study items match. Save a private item from a published lesson.")}</p>
              )}
            </>
          )}
        </section>
        <nav aria-label={translateUi("Study workspace pages")}>
          <button disabled={page === 1 || selected.isFetching} onClick={() => setPage(page - 1)}>
            {translateUi("Previous page")}</button>
          <span>{translateUi("Page")}{" "}{page}</span>
          <button
            disabled={
              selected.isFetching ||
              page * 25 >=
                (tab === "PROGRESS" ? (progress.data?.total ?? 0) : (query.data?.total ?? 0))
            }
            onClick={() => setPage(page + 1)}
          >
            {translateUi("Next page")}</button>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
