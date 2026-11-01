import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen } from "lucide-react";
import { getChapterLessons } from "@workspace/api-client-react";
import { progressIdentity, sessionQueryKey } from "../lib/learning-progress-cache";
import { lessonError } from "../pages/lesson-reader";

/** Lesson availability is independent of question coverage and practice state. */
export function ChapterLearningAction({ chapterId }: { chapterId: string }) {
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
    <section className="curriculum-learning-action" aria-label="Chapter lessons">
      {!auth.isLoaded ? (
        <p role="status">Checking lesson access…</p>
      ) : !identity ? (
        <Link href="/sign-in" className="curriculum-action-quiet">
          Sign in to start learning
        </Link>
      ) : query.isError ? (
        <div role="alert">
          <p>Lesson availability could not load. Practice availability is shown separately.</p>
          <p>{lessonError(query.error)}</p>
          <button
            type="button"
            className="curriculum-action-quiet"
            onClick={() => void query.refetch()}
          >
            Retry lessons
          </button>
        </div>
      ) : query.isPending ? (
        <p role="status">Checking published lessons…</p>
      ) : query.data?.items?.length ? (
        <Link href={`/learn/chapters/${chapterId}`} className="curriculum-action">
          <BookOpen size={16} aria-hidden="true" /> Start Learning{" "}
          <span>({query.data.items.length} lessons)</span>
        </Link>
      ) : (
        <div>
          <p>Lessons coming soon</p>
          <button type="button" className="curriculum-action-quiet" disabled>
            Start Learning
          </button>
        </div>
      )}
    </section>
  );
}
