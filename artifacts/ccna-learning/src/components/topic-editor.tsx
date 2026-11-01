import { useEffect, useState, useRef, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { adminContentRequest, type ManagedTopic } from "@workspace/api-client-react";
import { AdminToast } from "./admin-ui";
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
import { useAdminSession } from "./admin-session-boundary";
import { adminMutationOptions } from "../lib/admin-session";
import { refreshCatalog } from "../lib/catalog-cache";
import {
  initialTopicSlug,
  validateTopicForm,
  topicRequestError,
  type TopicForm,
} from "../lib/topic-form";

export function TopicEditor({
  topic,
  onClose,
  onSaved,
  onCreated,
}: {
  topic: ManagedTopic | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onCreated?: (topic: { id: string; name: string; slug: string; status: string }) => void;
}) {
  const saving = useRef(false);
  const session = useAdminSession(),
    client = useQueryClient();
  const initial: TopicForm = {
    name: topic?.name ?? "",
    slug: topic?.slug ?? "",
    description: topic?.description ?? "",
    displayOrder: String(topic?.displayOrder ?? 0),
    status: topic?.status ?? "ACTIVE",
  };
  const [form, setForm] = useState(initial),
    [autoSlug, setAutoSlug] = useState(!topic),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false),
    [ack, setAck] = useState(false);
  const dirty = JSON.stringify(initial) !== JSON.stringify(form);
  const mappingChange = !!topic?.chapterIds.length && form.slug !== topic.slug;
  useEffect(() => {
    const handle = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [dirty]);
  useEffect(() => {
    if (!autoSlug || !form.name.trim()) return;
    const controller = new AbortController(),
      current = session.capture();
    const timer = setTimeout(() => {
      void adminContentRequest<{ slug: string }>(
        "/api/admin/topics/manage/slug-suggestion?name=" + encodeURIComponent(form.name.trim()),
        { signal: controller.signal },
      )
        .then((r) => {
          if (current() && !controller.signal.aborted) setForm((f) => ({ ...f, slug: r.slug }));
        })
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.name, autoSlug, session]);
  const close = () => {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  function change(key: keyof TopicForm, value: string) {
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "name" && autoSlug ? { slug: initialTopicSlug(value) } : {}),
    }));
    setErrors((e) => ({ ...e, [key]: "" }));
    if (key === "slug") setAutoSlug(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || !session.isCurrent()) return;
    const next = validateTopicForm(form);
    setErrors(next);
    if (Object.keys(next).length || (mappingChange && !ack)) return;
    saving.current = true;
    setPending(true);
    setError("");
    const current = session.capture();
    try {
      const savedTopic = await adminContentRequest<{
        id: string;
        name: string;
        slug: string;
        status: string;
      }>("/api/admin/topics/manage" + (topic ? "/" + topic.id : ""), {
        ...adminMutationOptions("manage-topic", session.identity).request,
        method: topic ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Session": session.identity.sessionId,
        },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          displayOrder: Number(form.displayOrder),
          ...(topic
            ? { expectedVersion: topic.version, acknowledgeChapterChange: ack }
            : { autoSlug, ...(onCreated ? { rejectDuplicateName: true } : {}) }),
        }),
      });
      if (!current()) return;
      await refreshCatalog(client, session.identity, current);
      if (current()) {
        onCreated?.(savedTopic);
        onSaved(topic ? "Topic updated." : "Topic created.");
      }
    } catch (e) {
      if (current()) {
        setError(topicRequestError(e));
        const details = (
          e as { data?: { error?: { details?: { path: string; message: string }[] } } }
        )?.data?.error?.details;
        if (Array.isArray(details))
          setErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
      }
    } finally {
      saving.current = false;
      if (current()) setPending(false);
    }
  }
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <SheetContent
          className="topic-sheet"
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            close();
          }}
          onPointerDownOutside={(event) => {
            event.preventDefault();
            close();
          }}
        >
          <SheetHeader>
            <SheetTitle>{topic ? "Edit topic" : "Create topic"}</SheetTitle>
            <SheetDescription>
              A canonical chapter owns this topic identity. Its title and slug are fixed; description, availability and display order are editable.
            </SheetDescription>
          </SheetHeader>
          <form
            data-testid="form-admin-topic"
            className="topic-form"
            onSubmit={(event) => void save(event)}
          >
            {(["name", "description"] as const).map((key) => (
              <label key={key} htmlFor={"topic-" + key}>
                {key === "name" ? "Topic name" : "Description"}
                {key === "description" ? (
                  <textarea
                    id={"topic-" + key}
                    data-testid={"input-topic-" + key}
                    value={form[key]}
                    onChange={(e) => change(key, e.target.value)}
                    aria-invalid={!!errors[key]}
                    aria-describedby={"help-" + key}
                    disabled={pending}
                    rows={4}
                    maxLength={2000}
                  />
                ) : (
                  <input
                    autoFocus
                    readOnly={!!topic}
                    id={"topic-" + key}
                    data-testid={"input-topic-" + key}
                    value={form[key]}
                    onChange={(e) => change(key, e.target.value)}
                    aria-invalid={!!errors[key]}
                    aria-describedby={"help-" + key}
                    disabled={pending}
                    maxLength={180}
                    dir="auto"
                  />
                )}
                <small id={"help-" + key}>
                  {errors[key] ||
                    (key === "name"
                      ? "A clear, learner-friendly name."
                      : "Explain what learners will practice. Maximum 2,000 characters.")}
                </small>
              </label>
            ))}
            <label htmlFor="topic-status">
              Visibility
              <select
                id="topic-status"
                data-testid="select-topic-status"
                value={form.status}
                onChange={(e) => change("status", e.target.value)}
                disabled={pending}
              >
                <option value="ACTIVE">Enabled</option>
                <option value="DISABLED">Disabled</option>
              </select>
              <small>
                Disabled topics are hidden from the learner curriculum. Question status is
                unchanged.
              </small>
            </label>
            <details open={!!topic || !!errors.slug || !!errors.displayOrder}>
              <summary>Advanced settings</summary>
              <label htmlFor="topic-slug">
                Slug
                <input
                  id="topic-slug"
                  data-testid="input-topic-slug"
                  readOnly={!!topic}
                  value={form.slug}
                  onChange={(e) => change("slug", e.target.value)}
                  disabled={pending}
                  aria-invalid={!!errors.slug}
                  aria-describedby="help-slug"
                />
                <small id="help-slug">
                  {errors.slug ||
                    (autoSlug
                      ? "Automatically generated; uniqueness is checked again when saving."
                      : "Unique URL identifier. Reviewed chapter mappings use this exact slug.")}
                </small>
              </label>
              {!topic && (
                <label className="topic-check">
                  <input
                    type="checkbox"
                    checked={autoSlug}
                    disabled={pending}
                    onChange={(e) => {
                      setAutoSlug(e.target.checked);
                      if (e.target.checked)
                        setForm((f) => ({ ...f, slug: initialTopicSlug(f.name) }));
                    }}
                  />{" "}
                  Generate slug automatically
                </label>
              )}
              <label htmlFor="topic-order">
                Display order
                <input
                  id="topic-order"
                  data-testid="input-topic-displayOrder"
                  type="number"
                  min={0}
                  max={100000}
                  value={form.displayOrder}
                  onChange={(e) => change("displayOrder", e.target.value)}
                  disabled={pending}
                  aria-invalid={!!errors.displayOrder}
                />
                <small>
                  {errors.displayOrder || "Lower numbers appear first in the curriculum."}
                </small>
              </label>
            </details>
            {onCreated && (
              <p>
                Curriculum Chapter: determined by reviewed topic slug bindings. New arbitrary
                chapter bindings are not supported; no chapter will be guessed.
              </p>
            )}
            {mappingChange && (
              <label className="topic-warning">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  disabled={pending}
                />{" "}
                I understand that changing this reviewed slug may remove its curriculum chapter
                mapping.
              </label>
            )}
            {error && (
              <p role="alert" className="topic-warning">
                {error}
              </p>
            )}
            <footer>
              <button type="button" className="button-quiet" onClick={close} disabled={pending}>
                Cancel
              </button>
              <button
                data-testid="button-save-topic"
                className="button-primary"
                disabled={pending || (mappingChange && !ack)}
              >
                {pending ? "Saving…" : topic ? "Save changes" : "Create topic"}
              </button>
            </footer>
          </form>
        </SheetContent>
      </Sheet>
      {error && <AdminToast message={error} tone="error" onDismiss={() => setError("")} />}
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Discard changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
