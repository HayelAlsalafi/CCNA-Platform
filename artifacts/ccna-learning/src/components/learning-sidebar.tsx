import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { BookOpen, Terminal, FlaskConical, CircleHelp, ChevronDown, PanelLeft } from "lucide-react";
import {
  getChapterLessons,
  type CurriculumSummary,
  type LessonPublished,
} from "@workspace/api-client-react";
import { sessionQueryKey } from "../lib/learning-progress-cache";
import { useNexusIdentity } from "../lib/nexus";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "./ui/sheet";

// Activities are derived only from actual published lesson blocks. This registry
// can be extended when persisted lab/completion contracts become available.
export function publishedActivities(lesson: LessonPublished) {
  return lesson.blocks.flatMap<{ id: string; kind: "cli" | "quiz" | "reference"; title: string }>(
    (block, index) => {
      if (block.type === "code")
        return [{ id: block.id, kind: "cli" as const, title: `CLI example ${index + 1}` }];
      if (block.type === "knowledgeCheck")
        return [{ id: block.id, kind: "quiz" as const, title: block.prompt }];
      if (block.type === "labReference")
        return [{ id: block.id, kind: "reference" as const, title: block.title }];
      return [];
    },
  );
}
function ChapterActivities({
  chapterId,
  selectedId,
  lesson,
  onNavigate,
  enabled,
}: {
  chapterId: string;
  selectedId?: string;
  lesson?: LessonPublished;
  onNavigate: () => void;
  enabled: boolean;
}) {
  const identity = useNexusIdentity();
  const query = useQuery({
    queryKey: sessionQueryKey(["/api/chapters", chapterId, "lessons"], identity),
    enabled: !!identity && enabled,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      getChapterLessons(chapterId, { signal, cache: "no-store", credentials: "same-origin" }),
  });
  if (!enabled) return null;
  if (query.isPending)
    return (
      <p role="status" className="learning-nav-message">
        Loading published lessons…
      </p>
    );
  if (query.isError)
    return (
      <div className="learning-nav-message" role="alert">
        <p>Lessons could not load.</p>
        <button onClick={() => void query.refetch()}>Retry lessons</button>
      </div>
    );
  if (!query.data.items.length) return <p className="learning-nav-message">Lessons coming soon</p>;
  return (
    <ol className="learning-activities">
      {query.data.items.map((item, index) => (
        <li key={item.id}>
          <Link
            href={`/learn/chapters/${chapterId}/lessons/${item.id}`}
            aria-current={selectedId === item.id ? "page" : undefined}
            onClick={onNavigate}
          >
            <span className="learning-activity-number">{index + 1}</span>
            <BookOpen size={15} aria-hidden="true" />
            <span>
              {item.title}
              <small>{item.estimatedMinutes} min read</small>
            </span>
          </Link>
          {selectedId === item.id && lesson?.id === item.id && (
            <ol className="learning-block-activities">
              {publishedActivities(lesson).map((activity, i) => {
                const Icon =
                  activity.kind === "cli"
                    ? Terminal
                    : activity.kind === "quiz"
                      ? CircleHelp
                      : FlaskConical;
                return (
                  <li key={activity.id}>
                    <a href={`#section-${activity.id}`} onClick={onNavigate}>
                      <Icon size={14} aria-hidden="true" />
                      <span>
                        {index + 1}.{i + 1} {activity.title}
                        <small>
                          {activity.kind === "reference"
                            ? "External lab reference"
                            : activity.kind === "quiz"
                              ? "Local self-check"
                              : "Cisco CLI example"}
                        </small>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
        </li>
      ))}
    </ol>
  );
}
function NavigationTree({
  curriculum,
  chapterId,
  lessonId,
  lesson,
  onNavigate,
}: SidebarProps & { onNavigate: () => void }) {
  const activeDomain = curriculum.domains.find((d) =>
    d.sections.some((s) => s.chapters.some((c) => c.id === chapterId)),
  )?.id;
  const [domains, setDomains] = useState<string[]>(activeDomain ? [activeDomain] : []),
    [chapters, setChapters] = useState<string[]>([chapterId]);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDomains((previous) =>
      activeDomain && !previous.includes(activeDomain) ? [...previous, activeDomain] : previous,
    );
    setChapters((previous) => (previous.includes(chapterId) ? previous : [...previous, chapterId]));
  }, [chapterId, activeDomain]);
  useEffect(() => {
    const container = scroll.current;
    if (!container) return;
    const reveal = () => {
      const active = container.querySelector<HTMLElement>('[aria-current="page"]');
      if (active) {
        const offset = active.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTo?.({
          top: container.scrollTop + offset - container.clientHeight / 2,
          behavior: "auto",
        });
      }
    };
    // Query results can arrive after the selected route; observe only this tree.
    reveal();
    const observer = new MutationObserver(reveal);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [chapterId, lessonId]);
  const toggle = (list: string[], id: string, open: boolean) =>
    open ? [...new Set([...list, id])] : list.filter((value) => value !== id);
  return (
    <div className="learning-nav-scroll" ref={scroll}>
      <nav aria-label="Learning activities">
        {curriculum.domains.map((domain) => (
          <details
            className="learning-domain"
            key={domain.id}
            open={domains.includes(domain.id)}
            onToggle={(event) => {
              if (event.target === event.currentTarget) {
                const open = event.currentTarget.open;
                setDomains((previous) => toggle(previous, domain.id, open));
              }
            }}
          >
            <summary>
              <span className="learning-domain-code">{domain.number}</span>
              <span>{domain.title}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            {domain.sections.map((section) => (
              <div key={section.id}>
                <p className="learning-section-label">{section.title}</p>
                {section.chapters.map((chapter) => (
                  <details
                    className="learning-chapter"
                    key={chapter.id}
                    open={chapters.includes(chapter.id)}
                    onToggle={(event) => {
                      if (event.target === event.currentTarget) {
                        const open = event.currentTarget.open;
                        setChapters((previous) => toggle(previous, chapter.id, open));
                      }
                    }}
                  >
                    <summary>
                      <BookOpen size={15} aria-hidden="true" />
                      <span>{chapter.title}</span>
                      <ChevronDown size={13} aria-hidden="true" />
                    </summary>
                    <ChapterActivities
                      chapterId={chapter.id}
                      selectedId={lessonId}
                      lesson={lesson}
                      onNavigate={onNavigate}
                      enabled={domains.includes(domain.id) && chapters.includes(chapter.id)}
                    />
                  </details>
                ))}
              </div>
            ))}
          </details>
        ))}
      </nav>
      <p className="learning-nav-footnote">
        Only published lessons. Completion is never inferred from navigation.
      </p>
    </div>
  );
}
type SidebarProps = {
  curriculum: CurriculumSummary;
  chapterId: string;
  lessonId?: string;
  lesson?: LessonPublished;
};
export function LearningSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="learning-sidebar" aria-label="Curriculum navigation">
        <header>
          <BookOpen size={18} aria-hidden="true" />
          <div>
            <h2>Learning path</h2>
            <small>CCNA 200-301 · {props.curriculum.version}</small>
          </div>
        </header>
        <NavigationTree {...props} onNavigate={() => {}} />
      </aside>
      <div className="learning-mobile-navigation">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button type="button">
              <PanelLeft size={18} aria-hidden="true" /> Browse learning activities
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="learning-mobile-sheet">
            <SheetHeader>
              <SheetTitle>Learning path</SheetTitle>
              <SheetDescription>Choose a chapter and published lesson.</SheetDescription>
            </SheetHeader>
            <NavigationTree {...props} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
