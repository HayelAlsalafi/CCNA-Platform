import { UiMessage, DateText } from '../i18n';
import { useI18n } from '../i18n';
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Download, FileSpreadsheet, Upload, CheckCircle2 } from "lucide-react";
import {
  AdminPanel,
  AdminButton,
  AdminNotice,
  AdminSearch,
  AdminEmptyState,
  StatusIndicator,
} from "./admin-ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  adminContentRequest,
  useAdminListTopics,
  type ImportPreview,
  type ImportResult,
} from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import {
  adminMutationOptions,
  adminQueryOptions,
  invalidateAdminQueries,
} from "../lib/admin-session";
import { contentError, useTaxonomyCatalog } from "./admin-taxonomy";
import { refreshCatalog } from "../lib/catalog-cache";
function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export function AdminQuestionImport() {
  const { t: translateUi } = useI18n();
  const session = useAdminSession(),
    client = useQueryClient(),
    catalog = useTaxonomyCatalog();
  const topics = useAdminListTopics(adminQueryOptions(["/api/admin/topics"], session.identity));
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<ImportResult | null>(null);
  const [rowFilter, setRowFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [confirmOpen, setConfirmOpen] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const expired = !!preview && new Date(preview.expiresAt).getTime() <= now;
  async function download(extension: "csv" | "xlsx") {
    const current = session.capture();
    setError("");
    try {
      const blob = await adminContentRequest<Blob>(
        `/api/admin/question-import/template.${extension}`,
        { responseType: "blob" },
      );
      if (!current()) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ccna-questions.${extension}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (current()) setError(contentError(e));
    }
  }
  async function inspect() {
    if (!file || !session.isCurrent()) return;
    if (file.size > 2 * 1024 * 1024 || !file.size) {
      setError("Choose a non-empty file no larger than 2 MiB.");
      return;
    }
    const current = session.capture();
    setBusy(true);
    setError("");
    setResult(null);
    setPreview(null);
    setConfirmed(false);
    const options = adminMutationOptions("previewQuestionImport", session.identity).request;
    try {
      const dataBase64 = base64(await file.arrayBuffer());
      if (!current()) return;
      const response = await adminContentRequest<ImportPreview>(
        "/api/admin/question-import/preview",
        {
          ...options,
          method: "POST",
          headers: { ...options.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, dataBase64 }),
        },
      );
      if (current()) setPreview(response);
    } catch (e) {
      if (current()) setError(contentError(e));
    } finally {
      if (current()) setBusy(false);
    }
  }
  async function commit() {
    if (!preview || !confirmed || expired || !session.isCurrent()) return;
    const current = session.capture(),
      options = adminMutationOptions("confirmQuestionImport", session.identity).request;
    setBusy(true);
    setError("");
    try {
      const response = await adminContentRequest<ImportResult>(
        "/api/admin/question-import/confirm",
        {
          ...options,
          method: "POST",
          headers: { ...options.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ previewId: preview.previewId, confirmed: true }),
        },
      );
      if (!current()) return;
      setResult(response);
      setPreview(null);
      setConfirmed(false);
      await invalidateAdminQueries(client, ["/api/admin/questions"], session.identity);
      await refreshCatalog(client, session.identity, current);
    } catch (e) {
      if (current()) {
        setError(contentError(e));
        setPreview(null);
        setConfirmed(false);
      }
    } finally {
      if (current()) setBusy(false);
    }
  }
  const step = result ? 4 : preview ? 3 : file ? 2 : 1;
  const rows =
    preview?.rows.filter(
      (r) =>
        (rowFilter === "all" || r.status === rowFilter) &&
        (!search ||
          (r.text + " " + r.errors.map((e) => e.message).join(" "))
            .toLowerCase()
            .includes(search.toLowerCase())),
    ) ?? [];
  return (
    <>
      <ol className="import-steps" aria-label={translateUi("Question import progress")}>
        {["Template", "Upload", "Review", "Import"].map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
            <span aria-hidden="true">{step > i + 1 ? <CheckCircle2 size={16} /> : i + 1}</span>
            <UiMessage text={String(label)}/>
            {step > i + 1 && <span className="sr-only"> {translateUi("completed")}</span>}
          </li>
        ))}
      </ol>
      <AdminPanel
        title={translateUi("1. Start with a template")}
        description={translateUi("CSV or Excel, one worksheet, up to 500 questions and 2 MiB per file.")}
      >
        <div className="admin-summary-actions">
          <AdminButton variant="outline" onClick={() => void download("csv")}>
            <Download aria-hidden="true" size={16} />
            {translateUi("Download CSV template")}</AdminButton>
          <AdminButton variant="outline" onClick={() => void download("xlsx")}>
            <FileSpreadsheet aria-hidden="true" size={16} />
            {translateUi("Download XLSX template")}</AdminButton>
        </div>
        <details>
          <summary>{translateUi("Template fields and formatting")}</summary>
          <p>
            {translateUi("Required: chapterCode (for example CCNA-V1-01), text, difficulty (EASY / MEDIUM / HARD), optionA, optionB and correctOption (A-J; separate multiple correct answers with semicolons). Add optionC to optionJ as needed. Use questionType MULTIPLE_CHOICE_MULTIPLE for multiple answers; the default is MULTIPLE_CHOICE_SINGLE. Explanation and referenceNotes are optional for drafts.")}</p>
          <p>
            {translateUi("Use plain values; formulas and merged cells are unsupported. Every question belongs to one canonical chapter and inherits its primary domain. You may use its stable topicId instead of chapterCode; if both are supplied they must match. Legacy objective columns are retired.")}</p>
        </details>
        <details>
          <summary>{translateUi("Canonical chapter codes and stable IDs")}</summary>
          <div className="import-reference">
            {topics.isError && <AdminNotice tone="error">{contentError(topics.error)}</AdminNotice>}
            {topics.data?.map((t) => (
              <p key={t.id}>
                <strong>{t.name}</strong> <code>{t.id}</code> <StatusIndicator status={t.status} />
              </p>
            ))}
            {catalog.isError && (
              <AdminNotice tone="error">{contentError(catalog.error)}</AdminNotice>
            )}
            {catalog.data?.chapters?.map(c=><p key={c.id}><strong>{c.code} / {c.title}</strong> <code>{c.id}</code></p>)}
          </div>
        </details>
      </AdminPanel>
      <AdminPanel
        title={translateUi("2. Upload and validate")}
        description={translateUi("Previewing a file checks its contents without creating questions.")}
      >
        <div className="import-upload">
          <Upload aria-hidden="true" size={24} />
          <label htmlFor="question-import-file">{translateUi("Select CSV / XLSX file")}</label>
          <input
            id="question-import-file"
            type="file"
            accept=".csv,.xlsx"
            aria-describedby="import-file-help"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setConfirmed(false);
              setConfirmOpen(false);
              setError("");
              setResult(null);
              setSearch("");
              setRowFilter("all");
            }}
          />
          <p className="admin-form-help" id="import-file-help">
            {translateUi("Your file stays in this session. Choose a completed template with plain question and answer values.")}</p>
          {file && (
            <p className="import-file-name">
              {file.name} / {(file.size / 1024).toFixed(1)} KiB
            </p>
          )}
        </div>
        <AdminButton disabled={!file || busy} onClick={() => void inspect()}>
          {busy ? translateUi("Working...") : translateUi("Validate and preview")}
        </AdminButton>
        {error && <AdminNotice tone="error"><UiMessage text={error}/></AdminNotice>}
      </AdminPanel>
      {preview && (
        <AdminPanel
          title={translateUi("3. Review before import")}
          description={translateUi("Check each row, its answers and its explicit objective associations.")}
        >
          <div className="import-counts">
            {(["accepted", "rejected", "duplicate"] as const).map((status) => (
              <div key={status}>
                <StatusIndicator status={status} />
                <strong>
                  {status === "duplicate" ? preview.summary.duplicates : preview.summary[status]}
                </strong>
              </div>
            ))}
          </div>
          <p role="status" className="admin-muted">
            {preview.summary.accepted} {translateUi("accepted /")}{" "}{preview.summary.rejected} {translateUi("rejected /")}{" "}
            {preview.summary.duplicates} {translateUi("duplicates. Preview expires")}{" "}
            <DateText value={preview.expiresAt} options={{timeStyle:'short'}}/>.
          </p>
          <p className="admin-form-help">
            {translateUi("No questions have been written. Rejected and duplicate rows will be skipped; existing questions will not be updated.")}</p>
          {expired && (
            <AdminNotice tone="error">
              {translateUi("This preview expired. Select Validate and preview again before confirming an import.")}</AdminNotice>
          )}
          <div className="admin-toolbar">
            <AdminSearch
              label={translateUi("Search preview rows")}
              value={search}
              onChange={setSearch}
              placeholder={translateUi("Search questions or errors")}
            />
            <label>
              <span className="sr-only">{translateUi("Preview row status")}</span>
              <select value={rowFilter} onChange={(e) => setRowFilter(e.target.value)}>
                <option value="all">{translateUi("All rows")}</option>
                <option value="accepted">{translateUi("Ready")}</option>
                <option value="rejected">{translateUi("Needs attention")}</option>
                <option value="duplicate">{translateUi("Duplicates")}</option>
              </select>
            </label>
          </div>
          {!rows.length ? (
            <AdminEmptyState
              title={translateUi("No rows match this view")}
              description={translateUi("Change your search or status filter to see more preview rows.")}
            />
          ) : (
            <div className="admin-table-wrap">
              <table role="table" className="admin-table" aria-label={translateUi("Question import preview")}>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col">
                      {translateUi("Row")}</th>
                    <th role="columnheader" scope="col">
                      {translateUi("Status")}</th>
                    <th role="columnheader" scope="col">
                      {translateUi("Question / review")}</th>
                    <th role="columnheader" scope="col">
                      {translateUi("Errors")}</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {rows.map((row) => (
                    <tr role="row" key={row.row}>
                      <td role="cell" data-label="Row">
                        {row.row}
                      </td>
                      <td role="cell" data-label="Status">
                        <StatusIndicator status={row.status} />
                      </td>
                      <td role="cell" data-label="Question / review">
                        <details>
                          <summary>{row.text.slice(0, 150) || translateUi("Empty question")}</summary>
                          {row.question && (
                            <>
                              <p>{row.question.text}</p>
                              <p>{translateUi("Difficulty:")}{" "}<UiMessage text={row.question.difficulty}/></p>
                              {row.question.options.map((o) => (
                                <p key={o.optionKey}>
                                  {o.optionKey}. {o.text} {o.isCorrect ? translateUi("(correct)") : ""}
                                </p>
                              ))}
                              <p>{translateUi("Explanation:")}{" "}{row.question.explanation || translateUi("None")}</p>
                            </>
                          )}
                          <p>{translateUi("Chapter:")}{" "}{catalog.data?.chapters?.find(c=>c.id===row.question?.topicId)?.code??row.question?.topicId??translateUi("Invalid chapter")}</p>
                        </details>
                      </td>
                      <td role="cell" data-label="Errors" className="import-row-errors">
                        {row.errors.length ? (
                          row.errors.map((e, i) => (
                            <p key={i}>
                              {e.path}: {e.message}
                            </p>
                          ))
                        ) : (
                          <span className="admin-muted">{translateUi("No validation errors")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="import-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || expired || !preview.summary.accepted}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              {translateUi("I confirm importing")}{" "}{preview.summary.accepted} {translateUi("accepted rows as unpublished drafts. Rejected and duplicate rows will be skipped.")}</span>
          </label>
          <AdminButton
            disabled={!confirmed || busy || expired || !preview.summary.accepted}
            onClick={() => setConfirmOpen(true)}
          >
            {translateUi("Import accepted rows as drafts")}</AdminButton>
        </AdminPanel>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="admin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translateUi("Import")}{" "}{preview?.summary.accepted ?? 0} {translateUi("draft questions?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translateUi("Only accepted rows will be created. They remain unpublished and disabled until you review and activate them. Existing questions are preserved.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi("Back to preview")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || expired || !confirmed || !preview}
              onClick={() => void commit()}
            >
              {translateUi("Confirm draft import")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {result && (
        <AdminPanel title={translateUi("Import complete")} className="import-success">
          <div role="status">
            <p>
              <strong>{result.imported}</strong> {translateUi("questions imported as unpublished drafts (DISABLED).")}{" "}{result.rejected} {translateUi("rejected rows and")}{" "}{result.duplicates} {translateUi("duplicates were skipped.")}</p>
            <p className="admin-muted">
              {translateUi("Review and publish individual questions from Manage questions when ready.")}</p>
          </div>
          <div className="admin-summary-actions">
            <AdminButton asChild>
              <Link href="/admin/questions">{translateUi("Manage questions")}</Link>
            </AdminButton>
            <AdminButton
              variant="outline"
              onClick={() => {
                setResult(null);
                setFile(null);
                setConfirmed(false);
                setError("");
                const input = document.getElementById(
                  "question-import-file",
                ) as HTMLInputElement | null;
                if (input) input.value = "";
              }}
            >
              {translateUi("Import another file")}</AdminButton>
          </div>
          {result.questionIds?.length > 0 && (
            <details>
              <summary>{translateUi("Imported question IDs")}</summary>
              {result.questionIds.map((id) => (
                <p key={id}>
                  <code>{id}</code>
                </p>
              ))}
            </details>
          )}
        </AdminPanel>
      )}
    </>
  );
}
