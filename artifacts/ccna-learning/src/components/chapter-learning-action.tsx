import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen } from "lucide-react";
import { getChapterLessons } from "@workspace/api-client-react";
import { progressIdentity, sessionQueryKey } from "../lib/learning-progress-cache";
import { lessonError } from "../pages/lesson-reader";

/** Lesson availability is independent of question coverage and practice state. */
export function ChapterLearningAction({ chapterId }: { chapterId: string }) {
  const { t: translateUi } = useI18n();
  const auth = useAuth(),
    identity = progressIdentity(auth);
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/chapters", chapterId, "lessons"], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      getChapterLessons(chapterId, { signal, cache: "no-store", credentials: "same-origin" }),
  });
  return (
    <section className="curriculum-learning-action" aria-label={translateUi("Chapter lessons")}>
      {!auth.isLoaded ? (
        <p role="status">{translateUi("Checking lesson access…")}</p>
      ) : !identity ? (
        <Link href="/sign-in" className="curriculum-action-quiet">
          {translateUi("Sign in to start learning")}</Link>
      ) : query.isError ? (
        <div role="alert">
          <p>{translateUi("Lesson availability could not load. Practice availability is shown separately.")}</p>
          <p><UiMessage text={lessonError(query.error)}/></p>
          <button
            type="button"
            className="curriculum-action-quiet"
            onClick={() => void query.refetch()}
          >
            {translateUi("Retry lessons")}</button>
        </div>
      ) : query.isPending ? (
        <p role="status">{translateUi("Checking published lessons…")}</p>
      ) : query.data?.items?.length ? (
        <Link href={`/learn/chapters/${chapterId}`} className="curriculum-action">
          <BookOpen size={16} aria-hidden="true" /> {translateUi("Start Learning")}{" "}
          <span>({query.data.items.length} {translateUi("lessons)")}</span>
        </Link>
      ) : (
        <div>
          <p>{translateUi("Lessons coming soon")}</p>
          <button type="button" className="curriculum-action-quiet" disabled>
            {translateUi("Start Learning")}</button>
        </div>
      )}
    </section>
  );
}
