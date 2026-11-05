import { UiMessage, DateText } from '../i18n';
import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { MoreHorizontal, Plus, Download } from "lucide-react";
import {
  adminContentRequest,
  type StudioPage,
  type StudioRow,
  type StudioDetail,
  type TopicMetadata,
} from "@workspace/api-client-react";
import { AdminPageHeader, AdminSearch, AdminToast, StatusIndicator } from "./admin-ui";
import { adminQueryOptions, adminMutationOptions } from "../lib/admin-session";
import { refreshCatalog } from "../lib/catalog-cache";
import { useAdminSession } from "./admin-session-boundary";
import { useAdminDeleteControls } from "./admin-delete-controls";
import { QuestionStudioEditor } from "./question-studio-editor";
import { StudioRelationshipPicker } from "./studio-relationship-picker";
import { RelationshipFilter } from "./topics-manager";
import { TechnicalText, StudioPreview } from "./studio-preview";
import { newStudioForm, studioCsv } from "../lib/question-studio-form";
import { topicRequestError } from "../lib/topic-form";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import "../question-studio.css";
type Filters = {
  search: string;
  topicId: string;
  domainId: string;
  objectiveId: string;
  chapterId: string;
  difficulty: string;
  status: string;
  mapping: string;
  sort: string;
  direction: string;
  page: number;
  pageSize: number;
};
const defaults: Filters = {
  search: "",
  topicId: "",
  domainId: "",
  objectiveId: "",
  chapterId: "",
  difficulty: "",
  status: "",
  mapping: "",
  sort: "updatedAt",
  direction: "desc",
  page: 1,
  pageSize: 25,
};
function locationFilters(): Filters {
  const q = new URLSearchParams(window.location.search),
    next = { ...defaults };
  for (const key of [
    "search",
    "topicId",
    "domainId",
    "objectiveId",
    "chapterId",
    "difficulty",
    "status",
    "mapping",
    "sort",
    "direction",
  ] as const)
    next[key] = q.get(key) ?? defaults[key];
  next.page = Math.max(1, Math.min(100000, Number(q.get("page")) || 1));
  const size = Number(q.get("pageSize"));
  next.pageSize = [10, 25, 50].includes(size) ? size : 25;
  return next;
}
export function AdminQuestionManager() {
  const { t: translateUi, date } = useI18n();
  const session = useAdminSession(),
    client = useQueryClient();
  const [filters, setFilters] = useState(locationFilters),
    [search, setSearch] = useState(filters.search),
    [view, setView] = useState<"table" | "cards">(() => {
      try {
        return localStorage.getItem("ccna-question-view") === "cards" ? "cards" : "table";
      } catch {
        return "table";
      }
    }),
    [columns, setColumns] = useState({ mapping: true, updated: true });
  const [target, setTarget] = useState<{
      id: string;
      mode: "details" | "edit" | "duplicate" | "preview";
    } | null>(null),
    [creating, setCreating] = useState(false),
    [revisionPage, setRevisionPage] = useState(1),
    [topicLabel, setTopicLabel] = useState(""),
    [objectiveLabel, setObjectiveLabel] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const [bulk, setBulk] = useState<{
      rows: StudioRow[];
      kind: "status" | "difficulty" | "topicId";
      value: string;
    } | null>(null),
    [bulkTopicLabel, setBulkTopicLabel] = useState(""),
    [bulkBusy, setBulkBusy] = useState(false),
    [bulkResults, setBulkResults] = useState<{ id: string; outcome: string; reason: string }[]>([]),
    [bulkKind, setBulkKind] = useState<"status" | "difficulty" | "topicId">("status"),
    [bulkValue, setBulkValue] = useState("DISABLED");
  const bulkLock = useRef(false),
    records = useRef(new Map<string, StudioRow>());
  const focusTarget = useRef<HTMLElement | null>(null);
  const restoreFocus = () => {
    if(!session.isCurrent())return;
    if (focusTarget.current?.isConnected) focusTarget.current.focus();
    else
      document.querySelector<HTMLButtonElement>('[data-testid="create-studio-question"]')?.focus();
  };
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((f) => (search === f.search ? f : { ...f, search, page: 1 })),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const back = () => {
      const f = locationFilters();
      setFilters(f);
      setSearch(f.search);
      setTarget(null);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") params.set(key, String(value));
  }
  useEffect(() => {
    const next = window.location.pathname + "?" + params.toString();
    if (window.location.pathname + window.location.search !== next)
      window.history.replaceState(window.history.state, "", next);
  }, [params.toString()]);
  const listing = useQuery({
    ...adminQueryOptions(["/api/admin/questions", "studio", params.toString()], session.identity)
      .query,
    queryFn: ({ signal }) =>
      adminContentRequest<StudioPage>("/api/admin/questions/studio?" + params, { signal }),
  });
  useEffect(() => {
    if (listing.data && listing.data.page !== filters.page)
      setFilters((f) => ({ ...f, page: listing.data!.page }));
  }, [listing.data, filters.page]);
  const metadata = useQuery({
    ...adminQueryOptions(["/api/admin/questions", "metadata"], session.identity).query,
    queryFn: ({ signal }) =>
      adminContentRequest<TopicMetadata>("/api/admin/topics/manage/metadata", { signal }),
  });
  const detail = useQuery({
    ...adminQueryOptions(
      ["/api/admin/questions", "detail", target?.id, revisionPage],
      session.identity,
    ).query,
    enabled: !!target,
    queryFn: ({ signal }) =>
      adminContentRequest<StudioDetail>(
        `/api/admin/questions/studio/${target!.id}?revisionPage=${revisionPage}`,
        { signal },
      ),
  });
  const rows = listing.data?.items ?? [],
    stats = listing.data?.stats;
  const filterScope = JSON.stringify(
    Object.entries(filters).filter(
      ([key]) => !["page", "pageSize", "sort", "direction"].includes(key),
    ),
  );
  const deletion = useAdminDeleteControls(
    "questions",
    rows.map((r) => r.id),
    filterScope,
    true,
    {
      retainAcrossPages: true,
      preview: async (ids) => {
        const preview = await adminContentRequest<{
          items: {
            id: string;
            questionCode: string;
            revisions: number;
            deliveries: number;
            attempts: number;
          }[];
        }>("/api/admin/questions/studio/deletion-preview", {
          ...adminMutationOptions("question-dependencies", session.identity).request,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          body: JSON.stringify({ ids }),
        });
        return (
          <div className="topic-dependency-list">
            {preview.items.map((q) => (
              <p key={q.id}>
                <strong>{q.questionCode}</strong> · {q.revisions} {translateUi("immutable revisions,")}{" "}
                {q.deliveries} {translateUi("deliveries,")}{" "}{q.attempts} {translateUi("learner attempts.")}{" "}
                {q.revisions + q.deliveries + q.attempts > 0
                  ? translateUi("Standard deletion is BLOCKED.")
                  : translateUi("Rechecked at confirmation.")}
              </p>
            ))}
            <p>
              {translateUi("Deleting history requires the separate, explicit history preview and confirmation. It never happens automatically.")}</p>
          </div>
        );
      },
    },
  );
  useEffect(() => {
    const next = new Map<string, StudioRow>();
    for (const id of deletion.selected) {
      const row = rows.find((r) => r.id === id) ?? records.current.get(id);
      if (row) next.set(id, row);
    }
    records.current = next;
  }, [deletion.selected.join("|"), listing.data]);
  function filter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }
  function open(row: StudioRow, mode: "details" | "edit" | "duplicate" | "preview") {
    focusTarget.current = document.activeElement as HTMLElement;
    setRevisionPage(1);
    setTarget({ id: row.id, mode });
  }
  function changeView(next: "table" | "cards") {
    setView(next);
    try {
      localStorage.setItem("ccna-question-view", next);
    } catch {
      /* Preference storage is optional. */
    }
  }
  function confirmBulk(kind = bulkKind, value = bulkValue, single?: StudioRow) {
    const selected = single
      ? [single]
      : deletion.selected.map((id) => records.current.get(id)).filter((r): r is StudioRow => !!r);
    if (!selected.length || (!single && selected.length !== deletion.selected.length)) {
      setError("Refresh and select these questions again.");
      return;
    }
    setError("");
    setBulk({ rows: selected, kind, value });
  }
  async function runBulk() {
    if (!bulk || !bulk.value || bulkLock.current || !session.isCurrent()) return;
    bulkLock.current = true;
    setBulkBusy(true);
    setError("");
    const current = session.capture();
    try {
      const result = await adminContentRequest<{
        items: typeof bulkResults;
        updated: number;
        blocked: number;
      }>("/api/admin/questions/studio/bulk", {
        ...adminMutationOptions("studio-bulk", session.identity).request,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Session": session.identity.sessionId,
        },
        body: JSON.stringify({
          items: bulk.rows.map((q) => ({ id: q.id, editToken: q.editToken })),
          change: { [bulk.kind]: bulk.value },
        }),
      });
      if (!current()) return;
      setBulkResults(result.items);
      setToast(`${result.updated} questions updated; ${result.blocked} blocked.`);
      setBulk(null);
      deletion.setSelected([]);
      await refreshCatalog(client, session.identity, current);
    } catch (e) {
      if (current())
        setError(
          "FAILED: " + topicRequestError(e) + " Refresh before retrying; no success is assumed.",
        );
    } finally {
      bulkLock.current = false;
      if (current()) setBulkBusy(false);
    }
  }
  function exportPage() {
    if (!rows.length) return;
    const url = URL.createObjectURL(
        new Blob([studioCsv(rows)], { type: "text/csv;charset=utf-8" }),
      ),
      link = document.createElement("a");
    link.href = url;
    link.download = "question-bank-page-" + (listing.data?.page ?? 1) + ".csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const mapping = (row:StudioRow)=>row.chapterIds.length?"Chapter mapped":"Missing chapter";
  const actions = (row: StudioRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={"Actions for " + row.questionCode}>
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => open(row, "details")}>{translateUi("View details")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(row, "edit")}>{translateUi("Edit")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(row, "duplicate")}>{translateUi("Duplicate")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(row, "preview")}>{translateUi("Preview")}</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            confirmBulk("status", row.status === "ACTIVE" ? "DISABLED" : "ACTIVE", row)
          }
        >
          {row.status === "ACTIVE" ? translateUi("Disable") : translateUi("Enable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => void deletion.requestDelete([row.id])}
        >
          {translateUi("Delete permanently")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const saved = (message: string) => {
    setCreating(false);
    setTarget(null);
    setToast(message);
  };
  return (
    <section className="question-studio" data-testid="admin-question-manager">
      <AdminPageHeader
        title={translateUi("Question Bank")}
        description={translateUi("Create, classify and review CCNA assessments with learner history preserved.")}
        action={
          <div className="studio-header-actions">
            <Link href="/admin/import" className="button-quiet">
              {translateUi("Import Questions")}</Link>
            <Button variant="outline" onClick={exportPage} disabled={!rows.length}>
              <Download size={16} />
              {translateUi("Export current page")}</Button>
            <Button
              data-testid="create-studio-question"
              onClick={(event) => {
                focusTarget.current = event.currentTarget;
                setCreating(true);
              }}
            >
              <Plus size={16} />
              {translateUi("Create Question")}</Button>
          </div>
        }
      />
      <div className="studio-metrics">
        {[
          ["Total questions", stats?.total],
          ["Published / active", stats?.active],
          ["Unpublished / disabled", stats?.disabled],
          ["Missing chapters", stats?.missingChapters],
        ].map(([title, count]) => (
          <div key={title}>
            <small>{title}</small>
            <strong>{count ?? "—"}</strong>
          </div>
        ))}
      </div>
      <p className="studio-metric-note">
        {translateUi("Difficulty:")}{" "}{stats?.easy ?? "—"} {translateUi("easy ·")}{" "}{stats?.medium ?? "—"} {translateUi("medium ·")}{" "}{stats?.hard ?? "—"}{" "}
        {translateUi("hard. Draft imports use DISABLED; there is no separate draft or review state.")}</p>
      <div className="studio-filters">
        <AdminSearch
          label={translateUi("Search question bank")}
          value={search}
          onChange={setSearch}
          placeholder={translateUi("Search all questions by text or code…")}
        />
        <StudioRelationshipPicker
          kind="topics"
          label={translateUi("Filter by topic")}
          value={filters.topicId}
          selectedLabel={topicLabel}
          onSelect={(item) => {
            filter("topicId", item?.id ?? "");
            setTopicLabel(item?.label ?? "");
          }}
        />
        <RelationshipFilter
          label={translateUi("Exam domains")}
          value={filters.domainId}
          options={(metadata.data?.taxonomyDomains ?? []).map((d) => ({
            id: d.id,
            title: `${d.code} ${d.name} · ${d.version}`,
          }))}
          onChange={(v) => {
            filter("domainId", v);
            setFilters((f) => ({ ...f, objectiveId: "" }));
            setObjectiveLabel("");
          }}
        />
        <RelationshipFilter
          label={translateUi("Curriculum chapters")}
          value={filters.chapterId}
          options={metadata.data?.chapters ?? []}
          onChange={(v) => filter("chapterId", v)}
        />
        <label>
          {translateUi("Difficulty")}<select
            id="filter-question-difficulty"
            value={filters.difficulty}
            onChange={(e) => filter("difficulty", e.target.value)}
          >
            <option value="">{translateUi("All difficulties")}</option>
            {["EASY", "MEDIUM", "HARD"].map((d) => (
              <option key={d} value={d}><UiMessage text={String(d)}/></option>
            ))}
          </select>
        </label>
        <label>
          {translateUi("Status")}<select
            id="filter-question-status"
            value={filters.status}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">{translateUi("All statuses")}</option>
            <option value="ACTIVE">{translateUi("Published / active")}</option>
            <option value="DISABLED">{translateUi("Unpublished / disabled")}</option>
          </select>
        </label>
        <label>
          {translateUi("Mapping")}<select
            aria-label={translateUi("Mapping status filter")}
            value={filters.mapping}
            onChange={(e) => filter("mapping", e.target.value)}
          >
            <option value="">{translateUi("All mappings")}</option>
            <option value="full">{translateUi("Chapter mapped")}</option>
            <option value="chapter">{translateUi("Missing curriculum chapter")}</option>
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setFilters({ ...defaults });
            setSearch("");
            setTopicLabel("");
            setObjectiveLabel("");
          }}
        >
          {translateUi("Clear all filters")}</Button>
      </div>
      {metadata.isError && (
        <p role="alert">
          {translateUi("Relationship metadata could not load.")}{" "}
          <button onClick={() => void metadata.refetch()}>{translateUi("Retry filters")}</button>
        </p>
      )}
      <div className="studio-list-tools">
        <p aria-live="polite">{listing.data?.total ?? "…"} {translateUi("matching questions")}</p>
        <label>
          {translateUi("Sort")}<select
            aria-label={translateUi("Sort questions")}
            value={filters.sort}
            onChange={(e) => filter("sort", e.target.value)}
          >
            {[
              ["updatedAt", "Last updated"],
              ["createdAt", "Created date"],
              ["code", "Question code"],
              ["difficulty", "Difficulty"],
              ["status", "Status"],
            ].map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => filter("direction", filters.direction === "asc" ? "desc" : "asc")}
        >
          {filters.direction === "asc" ? translateUi("Ascending") : translateUi("Descending")}
        </Button>
        <Button
          variant={view === "table" ? "default" : "outline"}
          aria-pressed={view === "table"}
          onClick={() => changeView("table")}
        >
          {translateUi("Table")}</Button>
        <Button
          variant={view === "cards" ? "default" : "outline"}
          aria-pressed={view === "cards"}
          onClick={() => changeView("cards")}
        >
          {translateUi("Cards")}</Button>
        <details>
          <summary>{translateUi("Columns")}</summary>
          <label>
            <input
              type="checkbox"
              checked={columns.mapping}
              onChange={(e) => setColumns((c) => ({ ...c, mapping: e.target.checked }))}
            />
            {translateUi("Mappings")}</label>
          <label>
            <input
              type="checkbox"
              checked={columns.updated}
              onChange={(e) => setColumns((c) => ({ ...c, updated: e.target.checked }))}
            />
            {translateUi("Updated")}</label>
        </details>
      </div>
      {deletion.controls}
      {deletion.selected.length > 0 && (
        <div className="studio-bulk-toolbar">
          <strong>{translateUi("Bulk Actions")}</strong>
          <Button variant="outline" onClick={() => confirmBulk("status", "ACTIVE")}>
            {translateUi("Enable selected")}</Button>
          <Button variant="outline" onClick={() => confirmBulk("status", "DISABLED")}>
            {translateUi("Disable selected")}</Button>
          <label>
            {translateUi("Change")}<select
              aria-label={translateUi("Bulk change type")}
              value={bulkKind}
              onChange={(e) => {
                const kind = e.target.value as typeof bulkKind;
                setBulkKind(kind);
                setBulkValue(
                  kind === "difficulty" ? "MEDIUM" : kind === "status" ? "DISABLED" : "",
                );
              }}
            >
              <option value="status">{translateUi("Status")}</option>
              <option value="difficulty">{translateUi("Difficulty")}</option>
              <option value="topicId">{translateUi("Topic")}</option>
            </select>
          </label>
          {bulkKind === "topicId" ? (
            <StudioRelationshipPicker
              kind="topics"
              label={translateUi("Bulk target topic")}
              value={bulkValue}
              selectedLabel={bulkTopicLabel}
              onSelect={(item) => {
                setBulkValue(item?.id ?? "");
                setBulkTopicLabel(item?.label ?? "");
              }}
            />
          ) : (
            <select
              aria-label={translateUi("Bulk change value")}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            >
              {(bulkKind === "difficulty"
                ? ["EASY", "MEDIUM", "HARD"]
                : ["ACTIVE", "DISABLED"]
              ).map((v) => (
                <option key={v} value={v}><UiMessage text={String(v)}/></option>
              ))}
            </select>
          )}
          <Button variant="outline" disabled={!bulkValue} onClick={() => confirmBulk()}>
            {translateUi("Review bulk change")}</Button>
        </div>
      )}
      {error && !bulk && <p role="alert"><UiMessage text={error}/></p>}
      {bulkResults.length > 0 && (
        <details>
          <summary>{translateUi("Bulk results")}</summary>
          {bulkResults.map((r) => (
            <p key={r.id}>
              {r.id}: <strong>{r.outcome}</strong> — {r.reason}
            </p>
          ))}
        </details>
      )}
      {listing.isPending ? (
        <div role="status" aria-label={translateUi("Loading questions")}>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton className="h-16 mb-3" key={i} />
          ))}
        </div>
      ) : listing.isError ? (
        <div className="topic-empty" role="alert">
          <h2>{translateUi("Question bank could not load")}</h2>
          <p><UiMessage text={topicRequestError(listing.error)}/></p>
          <Button onClick={() => void listing.refetch()}>{translateUi("Retry")}</Button>
        </div>
      ) : !rows.length ? (
        <div className="topic-empty">
          <h2>{translateUi("No matching questions")}</h2>
          <p>{translateUi("Clear the filters or create a question to begin.")}</p>
        </div>
      ) : view === "table" ? (
        <div className="topic-table-scroll">
          <table className="topic-table studio-table" data-testid="table-admin-questions">
            <caption className="sr-only">
              {translateUi("Current question page. Selection across pages is explicit.")}</caption>
            <thead>
              <tr>
                {[
                  "Select",
                  "Code",
                  "Question",
                  "Topic",
                  ...(columns.mapping ? ["Book chapter"] : []),
                  "Difficulty",
                  "Status",
                  ...(columns.updated ? ["Updated"] : []),
                  "Actions",
                ].map((title) => (
                  <th scope="col" key={title}>
                    <UiMessage text={title}/>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{deletion.checkbox(row.id)}</td>
                  <td>
                    <button className="topic-name" onClick={() => open(row, "details")}>
                      {row.questionCode}
                    </button>
                  </td>
                  <td>
                    <button
                      className="studio-question-preview"
                      dir="auto"
                      onClick={() => open(row, "details")}
                    >
                      {row.text}
                    </button>
                  </td>
                  <td>{row.topicName}</td>
                  {columns.mapping && (
                    <td>
                      <small>{mapping(row)}</small>
                      {row.chapterIds.map(id=><span key={id}>{metadata.data?.chapters.find(c=>c.id===id)?.title??id}</span>)}
                    </td>
                  )}
                  <td><UiMessage text={row.difficulty}/></td>
                  <td>
                    <StatusIndicator status={row.status} />
                  </td>
                  {columns.updated && (
                    <td>
                      <time dateTime={row.updatedAt}>{date(row.updatedAt)}</time>
                    </td>
                  )}
                  <td>{actions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="topic-card-grid studio-cards">
          {rows.map((row) => (
            <article key={row.id}>
              <header>
                {deletion.checkbox(row.id)}
                <StatusIndicator status={row.status} />
                {actions(row)}
              </header>
              <button className="topic-name" onClick={() => open(row, "details")}>
                {row.questionCode}
              </button>
              <button className="studio-question-preview" onClick={() => open(row, "details")}>
                {row.text}
              </button>
              <small>
                {row.topicName} · <UiMessage text={row.difficulty}/>
              </small>
              <small>{mapping(row)}</small>
              <footer>{translateUi("Updated")}{" "}{date(row.updatedAt)}</footer>
            </article>
          ))}
        </div>
      )}
      <nav className="topic-pagination" aria-label={translateUi("Question pagination")}>
        <label>
          {translateUi("Rows per page")}<select
            aria-label={translateUi("Question page size")}
            value={filters.pageSize}
            onChange={(e) =>
              setFilters((f) => ({ ...f, pageSize: Number(e.target.value), page: 1 }))
            }
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}><UiMessage text={String(n)}/></option>
            ))}
          </select>
        </label>
        <span>
          {translateUi("Page")}{" "}{listing.data?.page ?? filters.page} {translateUi("of")}{" "}{listing.data?.totalPages ?? 1}
        </span>
        <Button
          variant="outline"
          disabled={listing.isFetching || (listing.data?.page ?? filters.page) <= 1}
          onClick={() => setFilters((f) => ({ ...f, page: (listing.data?.page ?? f.page) - 1 }))}
        >
          {translateUi("Previous")}</Button>
        <Button
          variant="outline"
          disabled={
            listing.isFetching || !listing.data || listing.data.page >= listing.data.totalPages
          }
          onClick={() => setFilters((f) => ({ ...f, page: listing.data!.page + 1 }))}
        >
          {translateUi("Next")}</Button>
      </nav>
      {creating && (
        <QuestionStudioEditor
          detail={null}
          onClose={() => setCreating(false)}
          onSaved={saved}
          onReturnFocus={restoreFocus}
        />
      )}
      {target && detail.data && (target.mode === "edit" || target.mode === "duplicate") && (
        <QuestionStudioEditor
          key={target.id + target.mode}
          detail={detail.data}
          duplicate={target.mode === "duplicate"}
          onClose={() => setTarget(null)}
          onSaved={saved}
          onReturnFocus={restoreFocus}
        />
      )}
      <Sheet
        open={!!target && (!detail.data || target.mode === "details" || target.mode === "preview")}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <SheetContent
          className="question-detail-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!target && !creating) restoreFocus();
          }}
        >
          <SheetHeader>
            <SheetTitle>{detail.data?.question.questionCode ?? translateUi("Question details")}</SheetTitle>
            <SheetDescription>
              {translateUi("Administrative answer key, mappings and immutable content revision references.")}</SheetDescription>
          </SheetHeader>
          {detail.isPending ? (
            <Skeleton className="h-40" />
          ) : detail.isError ? (
            <p role="alert">
              <UiMessage text={topicRequestError(detail.error)}/>{" "}
              <button onClick={() => void detail.refetch()}>{translateUi("Retry")}</button>
            </p>
          ) : (
            detail.data && (
              <div className="studio-detail">
                <div className="studio-detail-actions">
                  <Button onClick={() => setTarget((t) => (t ? { ...t, mode: "edit" } : null))}>
                    {translateUi("Edit")}</Button>
                  <Button
                    variant="outline"
                    onClick={() => setTarget((t) => (t ? { ...t, mode: "duplicate" } : null))}
                  >
                    {translateUi("Duplicate")}</Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setTarget((t) =>
                        t ? { ...t, mode: t.mode === "preview" ? "details" : "preview" } : null,
                      )
                    }
                  >
                    {target?.mode === "preview" ? translateUi("Details") : translateUi("Preview")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const data = detail.data!;
                      const row: StudioRow = {
                        ...data.question,
                        editToken: data.editToken,
                        topicName: data.topicName,
                        topicSlug: data.topicSlug,
                        chapterIds: data.chapterIds,
                        objectives: [],
                      };
                      confirmBulk("status", row.status === "ACTIVE" ? "DISABLED" : "ACTIVE", row);
                    }}
                  >
                    {translateUi("Enable / Disable")}</Button>
                  <Button
                    variant="outline"
                    onClick={() => void deletion.requestDelete([detail.data!.question.id])}
                  >
                    {translateUi("Delete permanently")}</Button>
                </div>
                {target?.mode === "preview" ? (
                  <StudioPreview
                    form={newStudioForm(detail.data.question, detail.data.assignments)}
                  />
                ) : (
                  <>
                    <TechnicalText text={detail.data.question.text} />
                    <ol className="studio-detail-options">
                      {detail.data.question.options.map((o) => (
                        <li key={o.optionKey}>
                          <strong>
                            {o.optionKey}
                            {o.isCorrect ? translateUi("· Correct answer") : ""}
                          </strong>
                          <TechnicalText text={o.text} />
                        </li>
                      ))}
                    </ol>
                    <h3>{translateUi("Explanation")}</h3>
                    <TechnicalText text={detail.data.question.explanation || "No explanation."} />
                    <h3>{translateUi("References / educational notes")}</h3>
                    <TechnicalText text={detail.data.question.referenceNotes || "No references."} />
                    <dl>
                      <dt>{translateUi("Topic")}</dt>
                      <dd>{detail.data.topicName}</dd>
                      <dt>{translateUi("Difficulty / state")}</dt>
                      <dd>
                        <UiMessage text={detail.data.question.difficulty}/> · <UiMessage text={detail.data.question.status}/>
                      </dd>
                      <dt>{translateUi("Chapters")}</dt>
                      <dd>
                        {detail.data.chapterIds
                          .map(
                            (id) => metadata.data?.chapters.find((c) => c.id === id)?.title ?? id,
                          )
                          .join(", ") || translateUi("Missing chapter mapping")}
                      </dd>
                      <dt>{translateUi("Created")}</dt>
                      <dd><DateText value={detail.data.question.createdAt} options={{dateStyle:'medium',timeStyle:'short'}}/></dd>
                      <dt>{translateUi("Updated")}</dt>
                      <dd><DateText value={detail.data.question.updatedAt} options={{dateStyle:'medium',timeStyle:'short'}}/></dd>
                    </dl>
                    <h3>{detail.data.revisionCount} {translateUi("immutable content revisions")}</h3>
                    <p>
                      {translateUi("History is read-only. Chapter identity is captured in the topic snapshot; snapshots do not include publication state or domain metadata or publication status; neither is claimed as revision history.")}</p>
                    {detail.data.revisions.map((r) => (
                      <details key={r.id}>
                        <summary>
                          <DateText value={r.createdAt} options={{dateStyle:'medium',timeStyle:'short'}}/> · {r.id}
                        </summary>
                        <code>{r.contentHash}</code>
                      </details>
                    ))}
                    <div className="studio-detail-actions">
                      <Button
                        variant="outline"
                        disabled={revisionPage <= 1}
                        onClick={() => setRevisionPage((p) => p - 1)}
                      >
                        {translateUi("Previous revisions")}</Button>
                      <Button
                        variant="outline"
                        disabled={revisionPage * 20 >= detail.data.revisionCount}
                        onClick={() => setRevisionPage((p) => p + 1)}
                      >
                        {translateUi("Next revisions")}</Button>
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!bulk}
        onOpenChange={(open) => {
          if (!open && !bulkBusy) setBulk(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translateUi("Change")}{" "}{bulk?.rows.length} {translateUi("selected questions?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translateUi("This changes only")}{" "}{bulk?.kind} {translateUi("to")}{" "}
              {bulk?.kind === "topicId" ? bulkTopicLabel || bulk.value : bulk?.value}{translateUi(". It preserves IDs, codes, attempts, deliveries and existing revisions. Changed or invalid records are BLOCKED. Publishing is validated per question.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="topic-dependency-list">
            {bulk?.rows.map((q) => (
              <p key={q.id}>
                {q.questionCode} · {q.topicName}
              </p>
            ))}
          </div>
          {error && <p role="alert"><UiMessage text={error}/></p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>{translateUi("Cancel")}</AlertDialogCancel>
            <Button
              disabled={bulkBusy || !bulk?.value}
              data-testid="button-confirm-disable-question"
              onClick={() => void runBulk()}
            >
              {bulkBusy ? translateUi("Updating…") : translateUi("Confirm bulk change")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {toast && (
        <div data-testid="admin-question-notice">
          <AdminToast message={toast} onDismiss={() => setToast("")} />
        </div>
      )}
    </section>
  );
}
