import { useEffect, useState, useRef } from "react";
import { lessonRequest } from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminMutationOptions } from "../lib/admin-session";
export function LessonImageUpload({ insert }: { insert: (url: string) => void }) {
  const session = useAdminSession(),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    inFlight = useRef(false);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <fieldset className="lesson-image-upload">
      <legend>Upload or replace image</legend>
      <p>
        PNG, JPEG or WebP, up to 5 MiB. Preview is temporary until Upload succeeds. Persistent
        storage requires separate activation.
      </p>
      <input
        aria-label="Choose lesson image"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          setError("");
          if (
            chosen &&
            (!["image/png", "image/jpeg", "image/webp"].includes(chosen.type) ||
              chosen.size > 5 * 1024 * 1024 ||
              chosen.size === 0)
          ) {
            setError("Choose a PNG, JPEG or WebP up to 5 MiB.");
            setFile(null);
            return;
          }
          setFile(chosen ?? null);
        }}
      />
      {preview && <img src={preview} alt="Selected image preview (not uploaded)" />}
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={!file || busy}
        onClick={async () => {
          if (!file || inFlight.current) return;
          inFlight.current = true;
          const current = session.capture();
          setBusy(true);
          setError("");
          try {
            const options = adminMutationOptions("lesson-media-upload", session.identity).request;
            const headers = new Headers(options.headers);
            headers.set("Content-Type", file.type);
            const result = await lessonRequest<{ url: string }>("/api/admin/lesson-media", {
              ...options,
              headers,
              method: "POST",
              body: file,
            });
            if (current()) {
              insert(result.url);
              setFile(null);
            }
          } catch (error) {
            if (current())
              setError(
                (error as { data?: { error?: { message?: string } } }).data?.error?.message ??
                  "Upload failed. The existing image is unchanged.",
              );
          } finally {
            inFlight.current = false;
            if (current()) setBusy(false);
          }
        }}
      >
        {busy ? "Uploading…" : "Upload and use image"}
      </button>
      <small>
        Replacing/removing a block never deletes shared media or images in published revisions.
      </small>
    </fieldset>
  );
}
