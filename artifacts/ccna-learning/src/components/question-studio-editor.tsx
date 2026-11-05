import { UiMessage, DateText } from '../i18n';
import { useI18n } from '../i18n';
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminContentRequest,
  type StudioDetail,
  type TopicMetadata,
  type StudioLookupItem,
} from "@workspace/api-client-react";
import { newStudioForm, validateStudioForm, type StudioForm } from "../lib/question-studio-form";
import { topicRequestError } from "../lib/topic-form";
import { adminMutationOptions, adminQueryOptions } from "../lib/admin-session";
import { refreshCatalog } from "../lib/catalog-cache";
import { useAdminSession } from "./admin-session-boundary";
import { StudioRelationshipPicker } from "./studio-relationship-picker";
import { RelationshipFilter } from "./topics-manager";
import { StudioPreview } from "./studio-preview";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
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
import { AdminToast } from "./admin-ui";
import { Button } from "./ui/button";

export function QuestionStudioEditor({
  detail,
  duplicate = false,
  onClose,
  onSaved,
  onReturnFocus,
}: {
  detail: StudioDetail | null;
  duplicate?: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
  onReturnFocus?: () => void;
}) {
  const { t: translateUi } = useI18n();
  const session = useAdminSession(),
    client = useQueryClient(),
    busy = useRef(false);
  const initial = newStudioForm(detail?.question, detail?.assignments),
    [form, setForm] = useState<StudioForm>(() => ({
      ...initial,
      ...(duplicate ? { status: "DISABLED" as const } : {}),
    })),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false),
    [ackDuplicate, setAckDuplicate] = useState(false),
    [duplicates, setDuplicates] = useState<{ id: string; questionCode: string; text: string }[]>(
      [],
    ),
    [checking, setChecking] = useState(false);
  const
    [notice, setNotice] = useState<{
      message: string;
      tone: "success" | "error" | "warning" | "info";
    } | null>(null);
  const [readiness, setReadiness] = useState<{
      ready: boolean;
      blockers: string[];
      warnings: string[];
    } | null>(null),
    [checkingReadiness, setCheckingReadiness] = useState(false);
  const baseline = useRef(initial);
  const [topicLabel, setTopicLabel] = useState(detail?.topicName ?? ""),
    [topicChapters, setTopicChapters] = useState<string[]>(detail?.chapterIds ?? []),
    [domainFilter, setDomainFilter] = useState("");
  const metadata = useQuery({
    ...adminQueryOptions(["/api/admin/questions", "editor-metadata"], session.identity).query,
    queryFn: ({ signal }) =>
      adminContentRequest<TopicMetadata>("/api/admin/topics/manage/metadata", { signal }),
  });
  const formRef = useRef(form);
  formRef.current = form;
  const pendingNavigation = useRef<string | null>(null);
  const allowingNavigation = useRef(false);
  const dirty = duplicate || JSON.stringify(form) !== JSON.stringify(baseline.current),
    publishingErrors = validateStudioForm(form, true);
  const payload = (status = form.status) => {
    const { assignments, referenceNotes, requiredSelectionCount: _count, ...fields } = form;
    return {
      question: {
        ...fields,
        status,
        referenceNotes: referenceNotes.trim() || null,
        imageKey: detail?.question.imageKey ?? null,
      },
      assignments: [],
      ...(detail && !duplicate ? { expectedToken: detail.editToken } : {}),
      acknowledgeDuplicate: ackDuplicate,
    };
  };
  useEffect(() => {
    const controller = new AbortController(),
      current = session.capture();
    setReadiness(null);
    setCheckingReadiness(true);
    const timer = setTimeout(() => {
      if (Object.keys(publishingErrors).length) {
        setCheckingReadiness(false);
        return;
      }
      void adminContentRequest<{ ready: boolean; blockers: string[]; warnings: string[] }>(
        "/api/admin/questions/studio/readiness",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          signal: controller.signal,
          body: JSON.stringify({
            draft: payload("ACTIVE"),
            ...(detail && !duplicate ? { questionId: detail.question.id } : {}),
          }),
        },
      )
        .then((r) => {
          if (current() && !controller.signal.aborted) setReadiness(r);
        })
        .catch(() => {
          if (current() && !controller.signal.aborted)
            setReadiness({
              ready: false,
              blockers: ["Server publication checks are unavailable. Retry before publishing."],
              warnings: [],
            });
        })
        .finally(() => {
          if (current() && !controller.signal.aborted) setCheckingReadiness(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [JSON.stringify(form), ackDuplicate, session.identity.sessionId]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    const currentUrl = window.location.href;
    const back = (event: PopStateEvent) => {
      if (allowingNavigation.current) return;
      if (!dirty && !busy.current) return;
      const destination = window.location.href;
      event.stopImmediatePropagation();
      window.history.pushState(window.history.state, "", currentUrl);
      if (busy.current) {
        setError("Wait for the save request to finish before navigating.");
        return;
      }
      pendingNavigation.current = destination;
      setDiscard(true);
    };
    window.addEventListener("popstate", back, true);
    return () => window.removeEventListener("popstate", back, true);
  }, [dirty]);
  const discardChanges = () => {
    const destination = pendingNavigation.current;
    pendingNavigation.current = null;
    allowingNavigation.current = true;
    onClose();
    if (destination) {
      window.history.pushState(window.history.state, "", destination);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };
  const close = () => {
    if (busy.current) return;
    if (dirty) {
      setNotice({
        message: "Unsaved question changes. Keep editing or explicitly discard them.",
        tone: "warning",
      });
      setDiscard(true);
    } else onClose();
  };
  function change<K extends keyof StudioForm>(field: K, value: StudioForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: "" }));
    if (field === "text" || field === "topicId") {
      setDuplicates([]);
      setAckDuplicate(false);
    }
  }
  function option(index: number, text: string) {
    setForm((f) => ({
      ...f,
      options: f.options.map((o, i) => (i === index ? { ...o, text } : o)),
    }));
    setErrors((e) => ({ ...e, ["option-" + index]: "" }));
  }
  function move(index: number, direction: number) {
    setForm((f) => {
      const options = [...f.options],
        target = index + direction;
      if (target < 0 || target >= options.length) return f;
      [options[index], options[target]] = [options[target], options[index]];
      return { ...f, options };
    });
  }
  async function checkDuplicates() {
    if (checking || !form.topicId || !form.text.trim() || !session.isCurrent()) return;
    const current = session.capture();
    const checked = JSON.stringify([form.topicId, form.text]);
    setChecking(true);
    try {
      const response = await adminContentRequest<{ items: typeof duplicates }>(
        "/api/admin/questions/studio/duplicates",
        {
          ...adminMutationOptions("question-duplicates", session.identity).request,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          body: JSON.stringify({
            topicId: form.topicId,
            text: form.text,
            ...(detail && !duplicate ? { excludeId: detail.question.id } : {}),
          }),
        },
      );
      if (
        current() &&
        checked === JSON.stringify([formRef.current.topicId, formRef.current.text])
      ) {
        setDuplicates(response.items);
        setAckDuplicate(false);
        const message = response.items.length
          ? "Possible duplicates found. Review and acknowledge before saving."
          : "No matching question text found in this topic.";
        setError("");
        setNotice({ message, tone: response.items.length ? "warning" : "info" });
      }
    } catch (e) {
      if (current()) setError(topicRequestError(e));
    } finally {
      if (current()) setChecking(false);
    }
  }
  async function save(status = form.status) {
    if (busy.current || !session.isCurrent()) return;
    const validation = validateStudioForm(form, status === "ACTIVE");
    setErrors(validation);
    if (Object.keys(validation).length) {
      setNotice({
        message:
          "Invalid answer configuration or missing question fields. Review the highlighted fields.",
        tone: "error",
      });
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    const current = session.capture();
    try {
      const result = await adminContentRequest<{ question: { id: string; questionCode: string } }>(
        "/api/admin/questions/studio" + (detail && !duplicate ? "/" + detail.question.id : ""),
        {
          ...adminMutationOptions("save-studio-question", session.identity).request,
          method: detail && !duplicate ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Session": session.identity.sessionId,
          },
          body: JSON.stringify(payload(status)),
        },
      );
      if (!current()) return;
      // Explicit network reload, never a stale cached detail or an assumed save.
      const saved = await adminContentRequest<StudioDetail>(
        "/api/admin/questions/studio/" + result.question.id,
      );
      if (!current()) return;
      const savedForm = newStudioForm(saved.question, saved.assignments);
      baseline.current = savedForm;
      setForm(savedForm);
      setTopicLabel(saved.topicName);
      setTopicChapters(saved.chapterIds);
      await refreshCatalog(client, session.identity, current);
      if (current())
        onSaved(
          detail && !duplicate
            ? `Question ${result.question.questionCode} updated.`
            : "Question created.",
        );
    } catch (e) {
      if (current()) {
        const message = topicRequestError(e);
        setError(message);
        setNotice({ message, tone: "error" });
        const details = (
          e as { data?: { error?: { details?: { path: string; message: string }[] } } }
        )?.data?.error?.details;
        if (Array.isArray(details))
          setErrors(
            Object.fromEntries(
              details.map((d) => {
                const path = d.path.replace(/^question\./, "");
                return [path.replace(/^options\.(\d+)\.text$/, "option-$1"), d.message];
              }),
            ),
          );
      }
    } finally {
      busy.current = false;
      if (current()) setPending(false);
    }
  }
  const field = (key: "text" | "explanation" | "referenceNotes", label: string, rows: number) => (
    <label htmlFor={"question-" + (key === "referenceNotes" ? "reference-notes" : key)}>
      <UiMessage text={label}/>
      <textarea
        id={"question-" + (key === "referenceNotes" ? "reference-notes" : key)}
        value={form[key]}
        onChange={(e) => change(key, e.target.value)}
        rows={rows}
        maxLength={10000}
        disabled={pending}
        aria-invalid={!!errors[key]}
        aria-describedby={"studio-error-" + key}
        spellCheck={false}
      />
      <small id={"studio-error-" + key}>
        <UiMessage text={errors[key] ||
          (key === "referenceNotes"
            ? translateUi("Educational sources/reference notes. No separate private-note field exists.")
            : translateUi("Plain text; line breaks, indentation and CLI output are preserved. HTML is displayed as text."))}/>
      </small>
    </label>
  );
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          className="question-editor-sheet"
          onCloseAutoFocus={(event) => {
            if (onReturnFocus) {
              event.preventDefault();
              onReturnFocus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (event.defaultPrevented) return;
            event.preventDefault();
            close();
          }}
          onPointerDownOutside={(event) => {
            const target = event.detail.originalEvent.target;
            if (
              (target instanceof Element && target.closest("[data-radix-popper-content-wrapper]"))
            ) {
              event.preventDefault();
              return;
            }
            event.preventDefault();
            close();
          }}
        >
          <SheetHeader>
            <SheetTitle>
              {duplicate
                ? translateUi("Duplicate question")
                : detail
                  ? "Edit " + detail.question.questionCode
                  : translateUi("Create Question")}
            </SheetTitle>
            <SheetDescription>
              {translateUi("Single or multiple-answer questions. Save unpublished content or publish a complete question. Existing learner history is preserved.")}</SheetDescription>
          </SheetHeader>
          <div className="question-editor-layout">
            <form
              noValidate
              data-testid="form-admin-question"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void save();
              }}
              className="studio-form"
            >
              <fieldset disabled={pending}>
                <legend>{translateUi("Question information")}</legend>
                <div className="studio-form-grid">
                  <label>
                    {translateUi("Question code")}<input
                      value={
                        detail && !duplicate
                          ? detail.question.questionCode
                          : "Generated by PostgreSQL after creation"
                      }
                      readOnly
                    />
                  </label>
                  <label>
                    {translateUi("Question Type")}<select
                      aria-label={translateUi("Question Type")}
                      value={form.type}
                      onChange={(e) => {
                        const type = e.target.value as StudioForm["type"];
                        const first = form.options.findIndex((o) => o.isCorrect);
                        setForm((f) => ({
                          ...f,
                          type,
                          requiredSelectionCount:
                            type === "MULTIPLE_CHOICE_SINGLE"
                              ? 1
                              : Math.max(2, f.options.filter((o) => o.isCorrect).length),
                          options:
                            type === "MULTIPLE_CHOICE_SINGLE"
                              ? f.options.map((o, i) => ({ ...o, isCorrect: i === first }))
                              : f.options,
                        }));
                      }}
                    >
                      <option value="MULTIPLE_CHOICE_SINGLE">{translateUi("Single Answer")}</option>
                      <option value="MULTIPLE_CHOICE_MULTIPLE">{translateUi("Multiple Answers")}</option>
                    </select>
                  </label>
                  <label htmlFor="question-difficulty">
                    {translateUi("Difficulty")}<select
                      id="question-difficulty"
                      value={form.difficulty}
                      onChange={(e) =>
                        change("difficulty", e.target.value as StudioForm["difficulty"])
                      }
                    >
                      {["EASY", "MEDIUM", "HARD"].map((d) => (
                        <option key={d} value={d}><UiMessage text={String(d)}/></option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="question-status">
                    {translateUi("Publication state")}<select
                      id="question-status"
                      value={form.status}
                      onChange={(e) => change("status", e.target.value as StudioForm["status"])}
                    >
                      <option value="DISABLED">{translateUi("Unpublished / disabled")}</option>
                      <option value="ACTIVE">{translateUi("Published / active")}</option>
                    </select>
                  </label>
                </div>
                {field("text", "Question text", 7)}
                <Button
                  type="button"
                  variant="outline"
                  disabled={checking || !form.topicId || !form.text.trim()}
                  onClick={() => void checkDuplicates()}
                >
                  {checking ? translateUi("Checking…") : translateUi("Check possible duplicates")}
                </Button>
              </fieldset>
              <fieldset disabled={pending}>
                <legend>{translateUi("Answer options")}</legend>
                <p>
                  {form.type === "MULTIPLE_CHOICE_SINGLE"
                    ? translateUi("Choose exactly one correct answer.")
                    : translateUi("Choose exactly {value0} correct answers.", {value0: String(form.requiredSelectionCount)})}{" "}
                  {translateUi("Provide 2-10 distinct options.")}</p>
                {form.type === "MULTIPLE_CHOICE_MULTIPLE" && (
                  <label>
                    {translateUi("Required selection count")}<input
                      aria-label={translateUi("Required selection count")}
                      type="number"
                      min={2}
                      max={form.options.length}
                      value={form.requiredSelectionCount}
                      onChange={(e) => change("requiredSelectionCount", Number(e.target.value))}
                    />
                  </label>
                )}
                {form.options.map((o, index) => (
                  <div className="studio-answer-row" key={o.optionKey}>
                    <label className="studio-correct">
                      <input
                        type={form.type === "MULTIPLE_CHOICE_MULTIPLE" ? "checkbox" : "radio"}
                        name="studio-correct"
                        aria-label={"Mark option " + o.optionKey + " as correct"}
                        checked={o.isCorrect}
                        onChange={() =>
                          change(
                            "options",
                            form.options.map((x, i) => ({
                              ...x,
                              isCorrect:
                                form.type === "MULTIPLE_CHOICE_MULTIPLE"
                                  ? i === index
                                    ? !x.isCorrect
                                    : x.isCorrect
                                  : i === index,
                            })),
                          )
                        }
                      />
                      <span>{o.optionKey}</span>
                    </label>
                    <label className="studio-answer-text">
                      <span className="sr-only">{translateUi("Option")}{" "}{o.optionKey} {translateUi("text")}</span>
                      <textarea
                        aria-label={"Option " + o.optionKey + " text"}
                        value={o.text}
                        onChange={(e) => option(index, e.target.value)}
                        rows={2}
                        maxLength={4000}
                        aria-invalid={!!errors["option-" + index]}
                      />
                      {errors["option-" + index] && <small><UiMessage text={errors["option-" + index]}/></small>}
                    </label>
                    <div className="studio-option-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={"Move option " + o.optionKey + " up"}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={"Move option " + o.optionKey + " down"}
                        disabled={index === form.options.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={"Remove option " + o.optionKey}
                        disabled={form.options.length <= 2}
                        onClick={() =>
                          change(
                            "options",
                            form.options.filter((_, i) => i !== index),
                          )
                        }
                      >
                        {translateUi("Remove")}</Button>
                    </div>
                  </div>
                ))}
                {errors.options && <p role="alert"><UiMessage text={errors.options}/></p>}
                <Button
                  type="button"
                  variant="outline"
                  disabled={form.options.length >= 10}
                  onClick={() => {
                    const used = new Set(form.options.map((o) => o.optionKey)),
                      key = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).find(
                        (k) => !used.has(k),
                      )!;
                    change("options", [
                      ...form.options,
                      { optionKey: key, text: "", isCorrect: false },
                    ]);
                  }}
                >
                  {translateUi("Add option")}</Button>
              </fieldset>
              <fieldset disabled={pending}>
                <legend>{translateUi("Explanation and references")}</legend>
                {field("explanation", "Technical explanation", 6)}
                {field("referenceNotes", "Educational references / notes", 3)}
                {detail?.question.imageKey && (
                  <p>
                    {translateUi("Existing image reference is preserved. Image uploads and remote image preview are unavailable until a validated media workflow exists.")}</p>
                )}
              </fieldset>
              <fieldset disabled={pending}>
                <legend>{translateUi("Canonical book chapter")}</legend>
                <RelationshipFilter label={translateUi("CCNA Exam Domain")} value={domainFilter} options={(metadata.data?.taxonomyDomains??[]).map(d=>({id:d.id,title:`${d.code} ${d.name}`}))} onChange={setDomainFilter}/>
                <StudioRelationshipPicker kind="topics" label={translateUi("Choose chapter")} value={form.topicId} selectedLabel={topicLabel} domainId={domainFilter||undefined} disabled={pending} onSelect={item=>{change("topicId",item?.id??"");setTopicLabel(item?.label??"");setTopicChapters(item?.chapterIds??[]);}}/>
                <small><UiMessage text={errors.topicId||translateUi("Choose one of the 48 exact V1/V2 book chapters. Its primary domain is assigned explicitly by the canonical catalog.")}/></small>
                <p><a href="/admin/taxonomy">{translateUi("Manage chapters and domains")}</a></p>
                {metadata.isError&&<p role="alert">{translateUi("Could not load chapter metadata.")}{" "}<button type="button" onClick={()=>void metadata.refetch()}>{translateUi("Retry")}</button></p>}
              </fieldset>
              <details
                className="studio-publish-checklist"
                open={Object.keys(publishingErrors).length > 0 || !!readiness?.blockers.length}
              >
                <summary>
                  {translateUi("Publishing Readiness -")}{" "}
                  {Object.keys(publishingErrors).length
                    ? translateUi("Missing Required Information")
                    : checkingReadiness
                      ? translateUi("Checking server requirements...")
                      : readiness?.ready
                        ? translateUi("Ready to Publish")
                        : translateUi("Needs Attention")}
                </summary>
                <h4>{translateUi("Blocking requirements")}</h4>
                <ul>
                  {[...Object.values(publishingErrors), ...(readiness?.blockers ?? [])].map(
                    (message, i) => (
                      <li key={i}><UiMessage text={message}/></li>
                    ),
                  )}
                </ul>
                {!Object.keys(publishingErrors).length && readiness?.ready && (
                  <p>
                    {translateUi("Server validation passed for these values. Saving rechecks concurrent changes.")}</p>
                )}
                <h4>{translateUi("Nonblocking warnings")}</h4>

                {!topicChapters.length && (
                  <p>{translateUi("No curriculum chapter. No placement will be guessed.")}</p>
                )}
              </details>
              {(duplicate ||
                duplicates.length > 0 ||
                error.toLowerCase().includes("duplicate")) && (
                <div className="studio-duplicate-warning">
                  {duplicates.map((q) => (
                    <p key={q.id}>
                      {q.questionCode}: {q.text}
                    </p>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={ackDuplicate}
                      onChange={(e) => setAckDuplicate(e.target.checked)}
                      disabled={pending}
                    />{" "}
                    {translateUi("I reviewed the possible duplicate and intend to create or save a separate record.")}</label>
                </div>
              )}
              {error && (
                <p role="alert" data-testid="admin-question-error">
                  <UiMessage text={error}/>
                </p>
              )}
              <p className="muted">{translateUi("New questions start unpublished. Reopen the saved question, review readiness, then publish explicitly.")}</p>
                <footer>
                <Button type="button" variant="outline" onClick={close} disabled={pending}>
                  {translateUi("Cancel")}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void save("DISABLED")}
                  disabled={pending}
                >
                  {translateUi("Save unpublished")}</Button>
                <Button type="submit" data-testid="button-save-question" disabled={pending}>
                  {pending
                    ? translateUi("Saving…")
                    : detail && !duplicate
                      ? translateUi("Save changes")
                      : form.status === "ACTIVE"
                        ? translateUi("Create unpublished")
                        : translateUi("Create question")}
                </Button>
              </footer>
            </form>
            <aside>
              <StudioPreview
                key={JSON.stringify([
                  form.text,
                  form.type,
                  form.requiredSelectionCount,
                  form.options,
                  form.explanation,
                ])}
                form={form}
              />
              {detail && (
                <p className="studio-editor-meta">
                  {translateUi("Created")}{" "}<DateText value={detail.question.createdAt} options={{dateStyle:'medium',timeStyle:'short'}}/> {translateUi("· Updated")}{" "}
                  <DateText value={detail.question.updatedAt} options={{dateStyle:'medium',timeStyle:'short'}}/> · {detail.revisionCount}{" "}
                  {translateUi("immutable content revisions.")}</p>
              )}
            </aside>
          </div>
        </SheetContent>
      </Sheet>
      {notice && (
        <AdminToast message={notice.message} tone={notice.tone} onDismiss={() => setNotice(null)} />
      )}
      <AlertDialog
        open={discard}
        onOpenChange={(open) => {
          setDiscard(open);
          if (!open) pendingNavigation.current = null;
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translateUi("Discard unsaved question changes?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {translateUi("Your question and chapter changes have not been saved.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{translateUi("Keep editing")}</AlertDialogCancel>
            <AlertDialogAction onClick={discardChanges} disabled={pending}>
              {translateUi("Discard changes")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
