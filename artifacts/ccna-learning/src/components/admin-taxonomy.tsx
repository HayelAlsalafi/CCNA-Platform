import {UiMessage} from "../i18n";
import { useI18n } from '../i18n';
import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adminContentRequest,
  type TaxonomyCatalog,
  type CanonicalChapter,
} from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminQueryKey } from "../lib/admin-session";
import { ccnaBookChapters, ccnaBookDomains } from "../lib/ccna-book-chapters";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { TaxonomyBookChapters } from "./taxonomy-book-chapters";
import { refreshCatalog } from "../lib/catalog-cache";
import { Button } from "./ui/button";
export function contentError(error: unknown): string {
  const e = error as {
    data?: { error?: { message?: string; details?: { path: string; message: string }[] } };
  };
  return [
    e?.data?.error?.message ?? "Request failed. Refresh or sign in again.",
    ...(e?.data?.error?.details ?? []).map((d) => `${d.path}: ${d.message}`),
  ].join(" ");
}
export const inputStyle = {
  padding: 8,
  border: "1px solid var(--line)",
  borderRadius: 6,
  width: "100%",
  background: "var(--surface, #fff)",
  font: "inherit",
};
export function useTaxonomyCatalog() {
  const session = useAdminSession();
  return useQuery({
    queryKey: adminQueryKey(["/api/admin/taxonomy"], session.identity),
    queryFn: ({ signal }) =>
      adminContentRequest<TaxonomyCatalog>("/api/admin/taxonomy", { signal }),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function AdminTaxonomyManager() {
  const { t: translateUi } = useI18n();
  const catalog = useTaxonomyCatalog(),
    session = useAdminSession(),
    cache = useQueryClient();
  const [search, setSearch] = useState(""),
    [domain, setDomain] = useState(""),
    [volume, setVolume] = useState(""),
    [status, setStatus] = useState("");
  const [reference, setReference] = useState(
    new URLSearchParams(window.location.search).get("view") === "book-chapters",
  );
  const [editing, setEditing] = useState<CanonicalChapter | null>(null),
    [creating, setCreating] = useState(false),
    [code, setCode] = useState("");
  const [description, setDescription] = useState(""),
    [enabled, setEnabled] = useState(true),
    [order, setOrder] = useState(0),
    [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const rows = catalog.data?.chapters ?? [],
    missing = ccnaBookChapters.filter((c) => !rows.some((r) => r.id === c.topicId));
  const save = useMutation({
    mutationFn: (body: unknown) =>
      adminContentRequest(`/api/admin/taxonomy/chapters${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      if (!session.isCurrent()) return;
      await refreshCatalog(cache, session.identity, session.isCurrent);
      setEditing(null);
      setCreating(false);
      setDirty(false);
      setMessage("Chapter saved.");
    },
  });
  function open(chapter: CanonicalChapter | null) {
    setEditing(chapter);
    setCreating(!chapter);
    setCode(chapter?.code ?? missing[0]?.code ?? "");
    setDescription(chapter?.description ?? "");
    setEnabled(chapter?.status !== "DISABLED");
    setOrder(chapter?.displayOrder ?? 0);
    setDirty(false);
    save.reset();
  }
  function close() {
    if (!save.isPending && (!dirty || window.confirm("Discard unsaved chapter changes?"))) {
      setEditing(null);
      setCreating(false);
      setDirty(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({
      code,
      description,
      status: enabled ? "ACTIVE" : "DISABLED",
      displayOrder: order,
      ...(editing ? { expectedVersion: editing.version } : {}),
    });
  }
  const visible = rows.filter(
    (c) =>
      (!domain || c.domainCode === domain) &&
      (!volume || c.volume === volume) &&
      (!status || c.status === status) &&
      `${c.title} ${c.code} ${c.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section aria-labelledby="chapter-heading" className="space-y-6">
      <header>
        <h1 id="chapter-heading">{translateUi("Chapters & domains")}</h1>
        <p>
          {translateUi("CCNA 200-301 v1.1 / 6 domains / 48 canonical book chapters. Questions and progress use the same stable chapter IDs.")}</p>
      </header>
      <p>
        <a className="underline" href="/admin/questions">
          {translateUi("Assign chapters in question management")}</a>
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant={reference ? "outline" : "default"} onClick={() => setReference(false)}>
          {translateUi("Manage chapters")}</Button>
        <Button variant={reference ? "default" : "outline"} onClick={() => setReference(true)}>
          {translateUi("Book chapters")}</Button>
      </div>
      {reference ? (
        <TaxonomyBookChapters />
      ) : (
        <>
          {catalog.isLoading && <p role="status">{translateUi("Loading chapters...")}</p>}
          {catalog.isError && (
            <div role="alert">
              {contentError(catalog.error)}{" "}
              <Button onClick={() => void catalog.refetch()}>{translateUi("Retry")}</Button>
            </div>
          )}
          {catalog.data && !catalog.data.canonicalReady && (
            <p role="status">
              {translateUi("Canonical chapters are awaiting the separately confirmed development reset. No database changes have been made by this page.")}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {ccnaBookDomains.map((d) => (
              <article key={d.code} className="rounded-lg border p-4">
                <strong>
                  {d.code} {d.name}
                </strong>
                <p>
                  {d.examWeight}% / {rows.filter((c) => c.domainCode === d.code).length}/
                  {d.chapters.length} {translateUi("chapters")}</p>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <label>
              {translateUi("Search chapters")}<input
                type="search"
                style={inputStyle}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              {translateUi("Domain")}<select style={inputStyle} value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="">{translateUi("All domains")}</option>
                {ccnaBookDomains.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translateUi("Book")}<select style={inputStyle} value={volume} onChange={(e) => setVolume(e.target.value)}>
                <option value="">{translateUi("All volumes")}</option>
                <option>V1</option>
                <option>V2</option>
              </select>
            </label>
            <label>
              {translateUi("Status")}<select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{translateUi("All statuses")}</option>
                <option value="ACTIVE">{translateUi("Enabled")}</option>
                <option value="DISABLED">{translateUi("Disabled")}</option>
              </select>
            </label>
            <Button
              disabled={!catalog.data?.canonicalReady || !missing.length}
              onClick={() => open(null)}
            >
              {translateUi("Create missing chapter")}</Button>
          </div>
          {message && <p role="status"><UiMessage text={message}/></p>}
          <p>
            {visible.length} {translateUi("chapters shown. Titles, V1/V2 numbering and primary domains follow the canonical book catalog.")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {["Chapter", "Title", "Domain", "Status", "Questions", "Actions"].map((h) => (
                    <th key={h} className="p-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{c.code}</td>
                    <td className="p-3">{c.title}</td>
                    <td className="p-3">
                      {ccnaBookDomains.find((d) => d.code === c.domainCode)?.name}
                    </td>
                    <td className="p-3"><UiMessage text={c.status}/></td>
                    <td className="p-3">
                      <a className="underline" href={`/admin/questions?topicId=${c.id}`}>
                        {c.questionCount}
                      </a>
                    </td>
                    <td className="p-3">
                      <Button variant="outline" onClick={() => open(c)}>
                        {translateUi("Edit")}{" "}{c.code}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && !catalog.isLoading && <p>{translateUi("No chapters match these filters.")}</p>}
        </>
      )}
      <Dialog
        open={!!editing || creating}
        onOpenChange={(v) => {
          if (!v) close();
        }}
      >
        <DialogContent>
          <DialogTitle>{editing ? translateUi("Edit chapter") : translateUi("Create missing canonical chapter")}</DialogTitle>
          <DialogDescription>
            {translateUi("Stable identity, title and primary domain remain fixed. Changes affect question availability; existing history is retained.")}</DialogDescription>
          <form onSubmit={submit} className="space-y-4" onChange={() => setDirty(true)}>
            {editing ? (
              <p>
                {editing.code} / {editing.title}
              </p>
            ) : (
              <label>
                {translateUi("Chapter")}<select style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)}>
                  {missing.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} / {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {translateUi("Description")}<textarea
                style={inputStyle}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              {translateUi("Display order")}<input
                style={inputStyle}
                type="number"
                min={0}
                max={100000}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              {translateUi("Enabled for learning")}</label>
            {save.isError && <p role="alert">{contentError(save.error)}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" disabled={save.isPending} onClick={close}>
                {translateUi("Cancel")}</Button>
              <Button disabled={save.isPending || !session.isCurrent()}>
                {save.isPending ? translateUi("Saving...") : translateUi("Save chapter")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
