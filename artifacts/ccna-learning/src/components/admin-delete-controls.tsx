import { useEffect, useRef, useState } from "react";
import "../practice-run.css";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminContentRequest } from "@workspace/api-client-react";
import { AdminToast } from "./admin-ui";
import { useAdminSession } from "./admin-session-boundary";
import { adminMutationOptions } from "../lib/admin-session";
import {topicRequestError} from "../lib/topic-form";
import { refreshCatalog } from "../lib/catalog-cache";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "./ui/alert-dialog";
type Item = { id: string; outcome: "DELETED" | "BLOCKED" | "FAILED"; auditId?:string; reason: string; constraint?: string };
type Result = { items: Item[]; deleted: number; blocked: number; failed?:number };
type HistoryPreview = {
  token: string;
  expiresAt: number;
  confirmation: string;
  warning: string;
  requiresHistory?:boolean;
  records: { id: string; questionCode?:string; revisions: string[]; deliveries: string[]; attempts: string[];sessionItems?:number;sessions?:number;examItems?:number;examSessions?:number }[];
};
const labels = { DELETED: "DELETED", BLOCKED: "BLOCKED", FAILED:"FAILED" };
class PermanentDeleteUnavailable extends Error {}
function assertPreview(preview:HistoryPreview,ids:string[]){
 if(!preview || !Array.isArray(preview.records) || preview.records.length!==ids.length || new Set(preview.records.map(r=>r.id)).size!==ids.length || preview.records.some(r=>!ids.includes(r.id)||!Array.isArray(r.attempts)||!Array.isArray(r.deliveries)||!Array.isArray(r.revisions)) || typeof preview.requiresHistory!=="boolean" || typeof preview.token!=="string" || preview.expiresAt<=Date.now())throw Error("Dependency preview is unavailable or stale. No deletion was requested.");
}

/** Mounted only beneath the existing server-verified Admin access boundary. */
export function useAdminDeleteControls(
  kind: "questions" | "topics",
  visibleIds: string[],
  scope: string,
  paginated = false,
  options: {
    retainAcrossPages?: boolean;
    preview?: (ids: string[]) => Promise<React.ReactNode>;
  } = {},
) {
  const session = useAdminSession(),
    client = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]),
    [confirmation, setConfirmation] = useState<string[] | null>(null);
  const [result, setResult] = useState<Result | null>(null),
    [error, setError] = useState("");
  const [notice,setNotice]=useState<{message:string;tone:"success"|"warning"|"error"}|null>(null);
  useEffect(()=>{if(error)setNotice({message:"FAILED: "+error,tone:"error"});},[error]);
  useEffect(()=>{if(result)setNotice({message:`${result.deleted} DELETED / ${result.blocked} BLOCKED / ${result.failed??0} FAILED`,tone:result.failed?"error":result.blocked?"warning":"success"});},[result]);
  const [questionPreview,setQuestionPreview]=useState<HistoryPreview|null>(null);
  const busy = useRef(false);
  const [deletePreview, setDeletePreview] = useState<React.ReactNode>(null),
    [previewPending, setPreviewPending] = useState(false),
    [previewFailed, setPreviewFailed] = useState(false);
  const requestDelete = async (ids: string[]) => {
    if (busy.current || !session.isCurrent() || !ids.length || ids.length > 500) return;
    setConfirmation([...ids]);
    setDeletePreview(null);setQuestionPreview(null);
    setPreviewFailed(false);
    if (options.preview || kind==="questions") {
      busy.current = true;
      setPreviewPending(true);
      const current = session.capture();
      try {
        if(kind==="questions") {
          const preview=await adminContentRequest<HistoryPreview>("/api/admin/questions/history-delete/preview",{...adminMutationOptions("preview-question-delete",session.identity).request,method:"POST",headers:{"Content-Type":"application/json","X-Admin-Session":session.identity.sessionId},body:JSON.stringify({ids})});
          assertPreview(preview,ids);
          if(current()) {setQuestionPreview(preview);setDeletePreview(<div>{preview.records.map(r=><p key={r.id}><strong>{r.questionCode??r.id}</strong>: {r.attempts.length} attempts, {r.deliveries.length} deliveries, {r.revisions.length} revisions, {r.sessionItems??0} practice positions, {r.examItems??0} exam deliveries across {r.examSessions??0} exams.</p>)}</div>);}
        } else {const content=await options.preview!(ids);if(current())setDeletePreview(content);}
      } catch(e) {
        if (current()) {
          setPreviewFailed(true);
          setError(topicRequestError(e));
        }
      } finally {
        busy.current = false;
        setPreviewPending(false);
      }
    }
  };
  const [historyPreview, setHistoryPreview] = useState<HistoryPreview | null>(null),
    [historyPhrase, setHistoryPhrase] = useState(""),
    [historyLoss, setHistoryLoss] = useState(false),
    [historyBusy, setHistoryBusy] = useState(false);
  const historyRequest = async (confirmPreview = false) => {
    if (busy.current || !session.isCurrent()) return;
    const ids = confirmation;
    if (!confirmPreview && !ids?.length) return;
    if (
      confirmPreview &&
      (!historyPreview || historyPhrase !== historyPreview.confirmation || !historyLoss)
    )
      return;
    if(!confirmPreview && questionPreview){setHistoryPreview(questionPreview);setHistoryPhrase("");setHistoryLoss(false);setConfirmation(null);return;}
    busy.current = true;
    setHistoryBusy(true);
    setError("");
    const current = session.capture();
    try {
      const response = await adminContentRequest<HistoryPreview | Result>(
        `/api/admin/questions/history-delete/${confirmPreview ? "confirm" : "preview"}`,
        {
          ...adminMutationOptions("history-delete-questions", session.identity).request,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          body: JSON.stringify(
            confirmPreview
              ? {
                  token: historyPreview!.token,
                  confirmation: historyPhrase,
                  acknowledgeHistoryLoss: historyLoss,
                }
              : { ids },
          ),
        },
      );
      if (!current()) return;
      if (confirmPreview) {
        const outcome = response as Result;
        if (
          !Array.isArray(outcome.items) ||
          outcome.items.some((x) => !["DELETED", "BLOCKED", "FAILED"].includes(x.outcome))
        )
          throw Error("Unsupported response");
        setResult(outcome);
        setHistoryPreview(null);
        setSelected([]);
        await refreshCatalog(client, session.identity, current);
      } else {
        setHistoryPreview(response as HistoryPreview);
        setHistoryPhrase("");
        setHistoryLoss(false);
        setConfirmation(null);
      }
    } catch(e) {
      if (current()) {
        setError(topicRequestError(e));
        if (confirmPreview) setHistoryPreview(null);
      }
    } finally {
      busy.current = false;
      setHistoryBusy(false);
    }
  };
  const mutation = useMutation({
    ...adminMutationOptions("delete-" + kind, session.identity).mutation,
    mutationFn: async (ids: string[]) => {
      const current = session.capture();
      // Do not issue a destructive request to a stale API that still archives.
      try {
        const policy = await adminContentRequest<{ mode: string }>(
          `/api/admin/${kind}/delete-policy`,
          adminMutationOptions("delete-" + kind, session.identity).request,
        );
        if (policy.mode !== (kind==="questions"?"permanent-only-v2":"permanent-only-v1")) throw new PermanentDeleteUnavailable();
      } catch {
        throw new PermanentDeleteUnavailable();
      }
      if (!current()) throw new PermanentDeleteUnavailable();
      const response = await adminContentRequest<Result>(
        ids.length === 1 ? `/api/admin/${kind}/${ids[0]}` : `/api/admin/${kind}/bulk-delete`,
        {
          ...adminMutationOptions("delete-" + kind, session.identity).request,
          method: ids.length === 1 ? "DELETE" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          ...(ids.length > 1 ? { body: JSON.stringify({ ids }) } : {}),
        },
      );
      if (
        !Array.isArray(response.items) ||
        response.items.some((item) => !["DELETED", "BLOCKED", "FAILED"].includes(item.outcome))
      )
        throw new Error("Unsupported delete response.");
      return response;
    },
  });
  useEffect(() => {
    setSelected([]);
    setConfirmation(null);
    setHistoryPreview(null);
  }, [scope]);
  useEffect(() => {
    if (!options.retainAcrossPages)
      setSelected((previous) => previous.filter((id) => visibleIds.includes(id)));
  }, [visibleIds.join("|")]);
  const toggle = (id: string) => {
    if (!busy.current && session.isCurrent())
      setSelected((s) =>
        s.includes(id) ? s.filter((x) => x !== id) : s.length < 500 ? [...s, id] : s,
      );
  };
  const confirm = async () => {
    if (
      busy.current ||
      previewPending ||
      previewFailed ||
      !confirmation?.length ||
      (kind==="questions" && (!questionPreview || questionPreview.requiresHistory)) ||
      !session.isCurrent()
    )
      return;
    busy.current = true;
    const current = session.capture();
    setError("");
    try {
      const response = await mutation.mutateAsync(confirmation);
      if (!current()) return;
      setResult(response);
      setSelected([]);
      setConfirmation(null);
      await refreshCatalog(client, session.identity, current);
    } catch (error) {
      if (current())
        setError(
          error instanceof PermanentDeleteUnavailable
            ? "Permanent-delete service is unavailable or stale. Restart the updated API or check your sign-in. No deletion request was sent."
            : "Deletion failed. No success is assumed. Refresh before retrying if the server response was lost.",
        );
    } finally {
      busy.current = false;
    }
  };
  const checkbox = (id: string) => (
    <input
      type="checkbox"
      aria-label={`Select ${kind.slice(0, -1)} ${id}`}
      checked={selected.includes(id)}
      disabled={mutation.isPending}
      onChange={() => toggle(id)}
    />
  );
  const deleteButton = (id: string) => (
    <button
      type="button"
      className="button-quiet"
      disabled={mutation.isPending}
      onClick={() => {
        if (session.isCurrent()) void requestDelete([id]);
      }}
    >
      Delete
    </button>
  );
  const controls = (
    <>
      <div className="admin-bulk-controls" aria-label={`Bulk ${kind} deletion`}>
        <label>
          <input
            type="checkbox"
            aria-label={
              paginated ? "Select all on current filtered page" : "Select all filtered results"
            }
            disabled={mutation.isPending || !visibleIds.length || visibleIds.length > 500}
            checked={visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))}
            onChange={(e) =>
              setSelected((previous) =>
                e.target.checked
                  ? [...new Set([...previous, ...visibleIds])].slice(0, 500)
                  : previous.filter((id) => !visibleIds.includes(id)),
              )
            }
          />{" "}
          {paginated ? "Select all on this page" : "Select all filtered results"}
        </label>
        <strong aria-live="polite">{selected.length} selected</strong>
        <button
          type="button"
          className="button-quiet"
          disabled={!selected.length || mutation.isPending}
          onClick={() => void requestDelete(selected)}
        >
          Delete Selected
        </button>
        <button
          type="button"
          className="button-quiet"
          disabled={!selected.length || mutation.isPending}
          onClick={() => setSelected([])}
        >
          Clear Selection
        </button>
        <small>
          {options.retainAcrossPages
            ? "Selection persists across pages; changing filters clears it. Select all applies to this page."
            : paginated
              ? "Changing page or filters clears selection."
              : "Changing filters clears selection."}{" "}
          Maximum 500 per batch.
        </small>
      </div>
      {notice && <AdminToast message={notice.message} tone={notice.tone} onDismiss={()=>setNotice(null)}/>}
      {error && <p role="alert">FAILED: {error}</p>}
      {result && (
        <div role="status" className="admin-delete-results">
          <strong>
            {result.deleted} DELETED · {result.blocked} BLOCKED
          </strong>
          <details>
            <summary>Individual outcomes</summary>
            <ul>
              {result.items.map((item) => (
                <li key={item.id}>
                  {item.id}: <strong>{labels[item.outcome]}</strong> — {item.reason}{" "}
                  {item.constraint && `(constraint: ${item.constraint})`} {item.auditId && `Audit receipt: ${item.auditId}`}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !busy.current) setConfirmation(null);
        }}
      >
        <AlertDialogContent className="admin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {confirmation?.length} {kind}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {kind==="questions" ? questionPreview?.records.length===1 ? `Are you sure you want to permanently delete question ${questionPreview.records[0].questionCode??questionPreview.records[0].id}? This action cannot be undone.` : "Permanently delete exactly the listed selected questions? This action cannot be undone." : "Permanently delete selected empty topics? Referenced topics remain BLOCKED; questions are never deleted implicitly."}
              {questionPreview?.requiresHistory && " Learner history exists. Continue to the separate destructive confirmation to review its exact consequences."}
            </AlertDialogDescription>
            {error && <p role="alert">FAILED: {error}</p>}
            {previewPending ? <p role="status">Checking dependencies…</p> : deletePreview}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            {kind === "questions" && (
              <button
                type="button"
                className="button-quiet"
                disabled={mutation.isPending || historyBusy || previewPending || previewFailed}
                onClick={() => void historyRequest()}
              >
                Preview deletion including history
              </button>
            )}
            <button
              type="button"
              className="button-primary"
              disabled={mutation.isPending || previewPending || previewFailed || (kind==="questions" && (!questionPreview || !!questionPreview.requiresHistory))}
              onClick={() => void confirm()}
            >
              {mutation.isPending ? "Processing…" : "Confirm deletion"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!historyPreview}
        onOpenChange={(open) => {
          if (!open && !busy.current) setHistoryPreview(null);
        }}
      >
        <AlertDialogContent className="admin-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete questions and history?</AlertDialogTitle>
            <AlertDialogDescription>
              {historyPreview?.warning} The preview expires after five minutes. Any change requires
              a new preview.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ maxHeight: "35vh", overflowY: "auto" }}>
            {historyPreview?.records.map((record) => (
              <details key={record.id}>
                <summary>
                  {record.questionCode??record.id}: {record.revisions.length} revisions, {record.deliveries.length}{" "}
                  deliveries, {record.attempts.length} learner attempts, {record.sessionItems??0} positions across {record.sessions??0} preserved practice sessions; {record.examItems??0} exam deliveries across {record.examSessions??0} preserved exams
                </summary>
                {(["revisions", "deliveries", "attempts"] as const).map((kind) => (
                  <p key={kind}>
                    {kind}: {record[kind].join(", ") || "none"}
                  </p>
                ))}
              </details>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={historyLoss}
              disabled={historyBusy}
              onChange={(e) => setHistoryLoss(e.target.checked)}
            />{" "}
            I authorize permanent loss of the listed learner history.
          </label>
          <label>
            Type {historyPreview?.confirmation}
            <input
              aria-label="History deletion confirmation phrase"
              value={historyPhrase}
              disabled={historyBusy}
              onChange={(e) => setHistoryPhrase(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={historyBusy}>Cancel</AlertDialogCancel>
            <button
              type="button"
              className="button-primary"
              disabled={
                historyBusy || !historyLoss || historyPhrase !== historyPreview?.confirmation
              }
              onClick={() => void historyRequest(true)}
            >
              Permanently delete listed questions and history
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
  return { controls, checkbox, deleteButton, selected, setSelected, requestDelete };
}
