import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { MoreHorizontal, Plus, Check, ChevronsUpDown } from "lucide-react";
import {
  adminContentRequest,
  type ManagedTopic,
  type TopicPage,
  type TopicMetadata,
  type TopicDetail,
  type TopicDependency,
} from "@workspace/api-client-react";
import { AdminPageHeader, AdminSearch, AdminToast, StatusIndicator } from "./admin-ui";
import { useAdminSession } from "./admin-session-boundary";
import { adminQueryOptions, adminMutationOptions } from "../lib/admin-session";
import { refreshCatalog } from "../lib/catalog-cache";
import { topicRequestError } from "../lib/topic-form";
import { useAdminDeleteControls } from "./admin-delete-controls";
import { TopicEditor } from "./topic-editor";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import "../topics-management.css";

export function RelationshipFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; title: string }[];
  onChange: (value: string) => void;
}) {
  const { t: translateUi, message } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={message(label)}
          className="topic-filter"
        >
          {options.find((o) => o.id === value)?.title ?? translateUi('All {value0}',{value0:message(label.toLowerCase())})}
          <ChevronsUpDown size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(90vw,340px)]">
        <Command>
          <CommandInput placeholder={translateUi('Search {value0}',{value0:message(label.toLowerCase())})} />
          <CommandList>
            <CommandEmpty>{translateUi("No matches.")}</CommandEmpty>
            <CommandGroup>
              {[{ id: "", title: translateUi('All {value0}',{value0:message(label.toLowerCase())}) }, ...options].map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id + " " + o.title}
                  onSelect={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  <Check className={value === o.id ? "opacity-100" : "opacity-0"} size={14} />
                  {o.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
export function AdminTopics() {
  const { t: translateUi, date, message } = useI18n();
  const session = useAdminSession(),
    client = useQueryClient();
  const [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [status, setStatus] = useState(""),
    [domain, setDomain] = useState(""),
    [chapter, setChapter] = useState(""),
    [taxonomyDomain, setTaxonomyDomain] = useState("");
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(25),
    [sort, setSort] = useState("displayOrder"),
    [direction, setDirection] = useState("asc"),
    [view, setView] = useState<"table" | "cards">("table");
  const [editor, setEditor] = useState<ManagedTopic | null | undefined>(),
    [detailId, setDetailId] = useState<string | null>(null),
    [questionPage, setQuestionPage] = useState(1),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const [statusConfirm, setStatusConfirm] = useState<{
      items: ManagedTopic[];
      status: "ACTIVE" | "DISABLED";
    } | null>(null),
    [statusBusy, setStatusBusy] = useState(false),
    [statusResult, setStatusResult] = useState<{ id: string; outcome: string; reason: string }[]>(
      [],
    );
  const statusLock = useRef(false),
    selectedRecords = useRef(new Map<string, ManagedTopic>());
  useEffect(() => {
    // Mounting or paging alone is not a search change. In particular, an
    // initial empty-search timer must not undo navigation after 300 ms.
    if (search === debounced) return;
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, debounced]);
  const filterScope = JSON.stringify([debounced, status, domain, chapter, taxonomyDomain]);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    sort,
    direction,
    ...(debounced ? { search: debounced } : {}),
    ...(status ? { status } : {}),
    ...(domain ? { domain } : {}),
    ...(chapter ? { chapter } : {}),
    ...(taxonomyDomain ? { taxonomyDomain } : {}),
  });
  const listing = useQuery({
    ...adminQueryOptions(["/api/admin/topics", "manage", params.toString()], session.identity)
      .query,
    queryFn: ({ signal }) =>
      adminContentRequest<TopicPage>("/api/admin/topics/manage?" + params, { signal }),
  });
  const metadata = useQuery({
    ...adminQueryOptions(["/api/admin/topics", "metadata"], session.identity).query,
    queryFn: ({ signal }) =>
      adminContentRequest<TopicMetadata>("/api/admin/topics/manage/metadata", { signal }),
  });
  const detail = useQuery({
    ...adminQueryOptions(["/api/admin/topics", "detail", detailId, questionPage], session.identity)
      .query,
    enabled: !!detailId,
    queryFn: ({ signal }) =>
      adminContentRequest<TopicDetail>(
        `/api/admin/topics/manage/${detailId}?questionPage=${questionPage}`,
        { signal },
      ),
  });
  const rows = listing.data?.items ?? [],
    meta = metadata.data;
  const deletions = useAdminDeleteControls(
    "topics",
    rows.map((r) => r.id),
    filterScope,
    true,
    {
      retainAcrossPages: true,
      preview: async (ids) => {
        const response = await adminContentRequest<{
          items: TopicDependency[];
          missingIds: string[];
        }>("/api/admin/topics/manage/deletion-preview", {
          ...adminMutationOptions("topic-dependencies", session.identity).request,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          body: JSON.stringify({ ids }),
        });
        return (
          <div className="topic-dependency-list">
            {response.items.map((r) => (
              <div key={r.id}>
                <strong dir="auto">{r.name}</strong>
                <small>
                  {r.questionCount} {translateUi("questions (")}{r.publishedQuestionCount} {translateUi("published),")}{" "}{r.attempts}{" "}
                  {translateUi("attempts,")}{" "}{r.revisionSnapshots} {translateUi("revision snapshots")}</small>
                <span>
                  {r.blocked
                    ? translateUi("BLOCKED by dependencies")
                    : translateUi("Eligible for permanent deletion; rechecked on confirmation")}
                </span>
              </div>
            ))}
            {response.missingIds.length > 0 && (
              <p>{response.missingIds.length} {translateUi("selected topics no longer exist.")}</p>
            )}
          </div>
        );
      },
    },
  );
  useEffect(() => {
    const keep = new Map<string, ManagedTopic>();
    for (const id of deletions.selected) {
      const record = rows.find((r) => r.id === id) ?? selectedRecords.current.get(id);
      if (record) keep.set(id, record);
    }
    selectedRecords.current = keep;
  }, [deletions.selected.join("|"), listing.data]);
  function filter(setter: (v: string) => void, value: string) {
    setter(value);
    setPage(1);
  }
  function showDetails(topic: ManagedTopic) {
    setQuestionPage(1);
    setDetailId(topic.id);
  }
  async function changeStatus() {
    if (!statusConfirm || statusLock.current || !session.isCurrent()) return;
    statusLock.current = true;
    setStatusBusy(true);
    setError("");
    const current = session.capture();
    try {
      const result = await adminContentRequest<{
        items: { id: string; outcome: string; reason: string }[];
        updated: number;
        blocked: number;
      }>("/api/admin/topics/manage/bulk-status", {
        ...adminMutationOptions("topic-status", session.identity).request,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Session": session.identity.sessionId,
        },
        body: JSON.stringify({
          status: statusConfirm.status,
          items: statusConfirm.items.map((r) => ({ id: r.id, version: r.version })),
        }),
      });
      if (!current()) return;
      setStatusResult(result.items);
      setToast(`${result.updated} topics updated; ${result.blocked} blocked.`);
      setStatusConfirm(null);
      deletions.setSelected([]);
      await refreshCatalog(client, session.identity, current);
    } catch (e) {
      if (current()) setError(topicRequestError(e));
    } finally {
      statusLock.current = false;
      if (current()) setStatusBusy(false);
    }
  }
  function bulkStatus(next: "ACTIVE" | "DISABLED") {
    const items = deletions.selected
      .map((id) => selectedRecords.current.get(id))
      .filter((r): r is ManagedTopic => !!r);
    if (items.length !== deletions.selected.length) {
      setError("Refresh and select the missing topics again.");
      return;
    }
    setError("");
    setStatusConfirm({ items, status: next });
  }
  const chaptersFor = (topic: ManagedTopic) =>
    topic.chapterIds.map((id) => meta?.chapters.find((c) => c.id === id)?.title ?? id).join(", ");
  const actions = (topic: ManagedTopic) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={"Actions for " + topic.name}>
          <MoreHorizontal size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => showDetails(topic)}>{translateUi("View details")}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setEditor(topic)}>{translateUi("Edit topic")}</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            setError("");
            setStatusConfirm({
              items: [topic],
              status: topic.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
            });
          }}
        >
          {topic.status === "ACTIVE" ? translateUi("Disable") : translateUi("Enable")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => void deletions.requestDelete([topic.id])}
        >
          {translateUi("Permanently delete")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <section className="topics-manager" aria-label={translateUi("Topics management")}>
      <AdminPageHeader
        title={translateUi("Chapter topics")}
        description={translateUi("Manage the 48 canonical book chapters and their learning availability.")}
        action={
          <Button asChild><a href="/admin/taxonomy">{translateUi("Manage canonical chapters")}</a></Button>
        }
      />
      <div className="topic-stats">
        {[
          ["All topics", listing.data?.stats.total],
          ["Enabled", listing.data?.stats.active],
          ["Disabled", listing.data?.stats.disabled],
        ].map(([label, value]) => (
          <div key={label}>
            <small><UiMessage text={String(label)}/></small>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
      </div>
      <div className="topic-toolbar">
        <AdminSearch
          label={translateUi("Search topics")}
          value={search}
          onChange={setSearch}
          placeholder={translateUi("Search name, slug or description…")}
        />
        <label>
          {translateUi("Status")}<select
            aria-label={translateUi("Filter status")}
            value={status}
            onChange={(e) => filter(setStatus, e.target.value)}
          >
            <option value="">{translateUi("All statuses")}</option>
            <option value="ACTIVE">{translateUi("Enabled")}</option>
            <option value="DISABLED">{translateUi("Disabled")}</option>
          </select>
        </label>
        <RelationshipFilter
          label={translateUi("Curriculum domains")}
          value={domain}
          options={meta?.curriculumDomains ?? []}
          onChange={(v) => {
            filter(setDomain, v);
            setChapter("");
          }}
        />
        <RelationshipFilter
          label={translateUi("Chapters")}
          value={chapter}
          options={(meta?.chapters ?? []).filter((c) => !domain || c.domainId === domain)}
          onChange={(v) => filter(setChapter, v)}
        />
        <RelationshipFilter
          label={translateUi("Taxonomy domains")}
          value={taxonomyDomain}
          options={(meta?.taxonomyDomains ?? []).map((d) => ({
            id: d.id,
            title: `${d.code} ${d.name} · ${d.version}`,
          }))}
          onChange={(v) => filter(setTaxonomyDomain, v)}
        />
      </div>
      {metadata.isError && (
        <p role="alert">
          {translateUi("Relationship filters could not load.")}{" "}
          <button onClick={() => void metadata.refetch()}>{translateUi("Retry filters")}</button>
        </p>
      )}
      <div className="topic-list-options">
        <p aria-live="polite">{listing.data?.total ?? "…"} {translateUi("matching topics")}</p>
        <label>
          {translateUi("Sort by")}<select
            aria-label={translateUi("Sort topics")}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="displayOrder">{translateUi("Display order")}</option>
            <option value="name">{translateUi("Name")}</option>
            <option value="status">{translateUi("Status")}</option>
            <option value="createdAt">{translateUi("Created date")}</option>
            <option value="updatedAt">{translateUi("Updated date")}</option>
          </select>
        </label>
        <Button
          variant="outline"
          onClick={() => setDirection((v) => (v === "asc" ? "desc" : "asc"))}
          aria-label={translateUi("Toggle sort direction")}
        >
          {direction === "asc" ? translateUi("Ascending") : translateUi("Descending")}
        </Button>
        <Button
          variant={view === "table" ? "default" : "outline"}
          aria-pressed={view === "table"}
          onClick={() => setView("table")}
        >
          {translateUi("Table")}</Button>
        <Button
          variant={view === "cards" ? "default" : "outline"}
          aria-pressed={view === "cards"}
          onClick={() => setView("cards")}
        >
          {translateUi("Cards")}</Button>
      </div>
      {deletions.controls}
      {deletions.selected.length > 0 && (
        <div className="topic-status-actions">
          <Button variant="outline" disabled={statusBusy} onClick={() => bulkStatus("ACTIVE")}>
            {translateUi("Enable selected")}</Button>
          <Button variant="outline" disabled={statusBusy} onClick={() => bulkStatus("DISABLED")}>
            {translateUi("Disable selected")}</Button>
        </div>
      )}
      {error && !statusConfirm && <p role="alert"><UiMessage text={error}/></p>}
      {statusResult.length > 0 && (
        <details className="topic-status-results">
          <summary>{translateUi("Visibility results")}</summary>
          {statusResult.map((r) => (
            <p key={r.id}>
              {r.id}: <strong>{r.outcome}</strong> — {r.reason}
            </p>
          ))}
        </details>
      )}
      {listing.isPending ? (
        <div aria-label={translateUi("Loading topics")} role="status">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 mb-3" />
          ))}
        </div>
      ) : listing.isError ? (
        <div role="alert" className="topic-empty">
          <h2>{translateUi("Topics could not load")}</h2>
          <p><UiMessage text={topicRequestError(listing.error)}/></p>
          <Button onClick={() => void listing.refetch()}>{translateUi("Retry")}</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="topic-empty">
          <h2>{translateUi("No matching topics")}</h2>
          <p>{translateUi("Try another search or create a topic to organize questions.")}</p>
          <Button
            onClick={() => {
              setSearch("");
              setStatus("");
              setDomain("");
              setChapter("");
              setTaxonomyDomain("");
              setPage(1);
            }}
          >
            {translateUi("Clear filters")}</Button>
        </div>
      ) : view === "table" ? (
        <div className="topic-table-scroll">
          <table className="topic-table">
            <caption className="sr-only">
              {translateUi("Topics on the current filtered page. Select all applies only to this page.")}</caption>
            <thead>
              <tr>
                {[
                  "Select",
                  "Topic",
                  "Relationships",
                  "Status",
                  "Questions",
                  "Order",
                  "Updated",
                  "Actions",
                ].map((title) => (
                  <th key={title} scope="col">
                    <UiMessage text={title}/>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((topic) => (
                <tr key={topic.id} data-testid={"topic-row-" + topic.id}>
                  <td>{deletions.checkbox(topic.id)}</td>
                  <td>
                    <button className="topic-name" onClick={() => showDetails(topic)} dir="auto">
                      {topic.name}
                    </button>
                    <small>{topic.slug}</small>
                  </td>
                  <td>
                    <span>{chaptersFor(topic) || translateUi("No chapter mapping")}</span>
                    <small>
                      {topic.objectiveCodes.length
                        ? "Chapter " + topic.objectiveCodes.join(", ")
                        : translateUi("No canonical chapter")}
                    </small>
                  </td>
                  <td>
                    <StatusIndicator status={topic.status} />
                  </td>
                  <td>
                    <Link href={"/admin/questions?topicId=" + topic.id}>{topic.questionCount}</Link>
                    <small>{topic.publishedQuestionCount} {translateUi("published")}</small>
                  </td>
                  <td>{topic.displayOrder}</td>
                  <td>
                    <time
                      dateTime={topic.updatedAt}
                      title={new Date(topic.updatedAt).toLocaleString()}
                    >
                      {date(topic.updatedAt)}
                    </time>
                  </td>
                  <td>{actions(topic)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="topic-card-grid">
          {rows.map((topic) => (
            <article key={topic.id}>
              <header>
                {deletions.checkbox(topic.id)}
                <StatusIndicator status={topic.status} />
                {actions(topic)}
              </header>
              <button className="topic-name" onClick={() => showDetails(topic)} dir="auto">
                {topic.name}
              </button>
              <small>{topic.slug}</small>
              <p>{topic.description || translateUi("No description yet.")}</p>
              <small>{chaptersFor(topic) || translateUi("No chapter mapping")}</small>
              <footer>
                <Link href={"/admin/questions?topicId=" + topic.id}>
                  {topic.questionCount} {translateUi("questions")}</Link>
                <time dateTime={topic.updatedAt}>{translateUi("Updated")}{" "}{date(topic.updatedAt)}</time>
              </footer>
            </article>
          ))}
        </div>
      )}
      <nav className="topic-pagination" aria-label={translateUi("Topic pagination")}>
        <label>
          {translateUi("Rows per page")}<select
            aria-label={translateUi("Rows per page")}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}><UiMessage text={String(n)}/></option>
            ))}
          </select>
        </label>
        <span>
          {translateUi("Page")}{" "}{listing.data?.page ?? page} {translateUi("of")}{" "}{listing.data?.totalPages ?? 1}
        </span>
        <Button
          variant="outline"
          disabled={listing.isFetching || (listing.data?.page ?? page) <= 1}
          onClick={() => setPage((listing.data?.page ?? page) - 1)}
        >
          {translateUi("Previous")}</Button>
        <Button
          variant="outline"
          disabled={
            listing.isFetching || !listing.data || listing.data.page >= listing.data.totalPages
          }
          onClick={() => setPage(listing.data!.page + 1)}
        >
          {translateUi("Next")}</Button>
      </nav>
      {editor !== undefined && (
        <TopicEditor
          key={editor?.id ?? "new"}
          topic={editor}
          onClose={() => setEditor(undefined)}
          onSaved={(message) => {
            setEditor(undefined);
            setToast(message);
          }}
        />
      )}
      <Sheet
        open={!!detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <SheetContent className="topic-sheet">
          <SheetHeader>
            <SheetTitle>{detail.data?.topic.name ?? translateUi("Topic details")}</SheetTitle>
            <SheetDescription>
              {translateUi("Topic metadata and existing curriculum and taxonomy relationships.")}</SheetDescription>
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
              <div className="topic-detail">
                <StatusIndicator status={detail.data.topic.status} />
                <p dir="auto">{detail.data.topic.description || translateUi("No description yet.")}</p>
                <dl>
                  {Object.entries({
                    Slug: detail.data.topic.slug,
                    ID: detail.data.topic.id,
                    "Display order": detail.data.topic.displayOrder,
                    Created: date(detail.data.topic.createdAt),
                    Updated: new Date(detail.data.topic.updatedAt).toLocaleString(),
                    Questions: `${detail.data.topic.questionCount} total · ${detail.data.topic.publishedQuestionCount} published`,
                    "Curriculum chapters":
                      chaptersFor(detail.data.topic) ||
                      "Unmapped. Chapter bindings are reviewed separately.",
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt>{message(key)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <h3>{translateUi("Canonical chapter and primary domain")}</h3>
                {detail.data.objectives.length ? (
                  <ul>
                    {detail.data.objectives.map((o) => (
                      <li key={o.id}>
                        <strong>{o.code}</strong> {o.description}
                        <small>
                          {o.domain} · {o.version}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{translateUi("No canonical chapter relationship. Complete the guarded development reset first.")}</p>
                )}
                {detail.data.objectivesTruncated && (
                  <p>{translateUi("Review complete chapter relationships in Taxonomy.")}</p>
                )}
                <h3>{translateUi("Linked questions")}</h3>
                {detail.data.questions.length ? (
                  <ul>
                    {detail.data.questions.map((q) => (
                      <li key={q.id}>
                        <Link href={"/admin/questions?topicId=" + detailId}>
                          {q.questionCode || q.id} · {q.text}
                        </Link>
                        <small>
                          <UiMessage text={q.difficulty}/> · <UiMessage text={q.status}/>
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{translateUi("No questions are linked to this topic yet.")}</p>
                )}
                <div className="topic-detail-pagination">
                  <Button
                    variant="outline"
                    disabled={detail.isFetching || detail.data.questionPage <= 1}
                    onClick={() => setQuestionPage(detail.data!.questionPage - 1)}
                  >
                    {translateUi("Previous questions")}</Button>
                  <span>
                    {detail.data.questionPage}/{detail.data.questionPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={
                      detail.isFetching || detail.data.questionPage >= detail.data.questionPages
                    }
                    onClick={() => setQuestionPage(detail.data!.questionPage + 1)}
                  >
                    {translateUi("Next questions")}</Button>
                </div>
                <Link href={"/admin/questions?topicId=" + detailId}>
                  {translateUi("Manage related questions →")}</Link>
                <Button
                  onClick={() => {
                    setEditor(detail.data!.topic);
                    setDetailId(null);
                  }}
                >
                  {translateUi("Edit topic")}</Button>
              </div>
            )
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={!!statusConfirm}
        onOpenChange={(open) => {
          if (!open && !statusBusy) setStatusConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusConfirm?.status === "ACTIVE" ? translateUi("Enable") : translateUi("Disable")}{" "}
              {statusConfirm?.items.length} {translateUi("topics?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translateUi("Changes topic visibility only. Questions and learner history are preserved. Concurrently changed topics will be BLOCKED.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="topic-dependency-list">
            {statusConfirm?.items.map((r) => (
              <p key={r.id}>
                <strong>{r.name}</strong> · {r.questionCount} {translateUi("questions (")}{r.publishedQuestionCount}{" "}
                {translateUi("published)")}</p>
            ))}
          </div>
          {error && <p role="alert"><UiMessage text={error}/></p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>{translateUi("Cancel")}</AlertDialogCancel>
            <Button disabled={statusBusy} onClick={() => void changeStatus()}>
              {statusBusy ? translateUi("Updating…") : translateUi("Confirm visibility change")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {toast && <AdminToast message={toast} onDismiss={() => setToast("")} />}
    </section>
  );
}
