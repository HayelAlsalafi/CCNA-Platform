import {UiMessage} from "../i18n";
import { useI18n } from '../i18n';
﻿import { createElement, useRef, useState } from "react";
import type { LessonBlock } from "@workspace/api-client-react";
import { useEffect } from "react";
import { customFetch, type StudyAnnotation } from "@workspace/api-client-react";
import { useNexusIdentity } from "../lib/nexus";
import { validAnchor } from "../../../../lib/lesson-study";
import "../lesson-visual-editor.css";
import { textColors, highlightColors } from "../lib/lesson-rich-text";

export function safeLessonUrl(value: string): string | null {
  try {
    if (/^\/api\/lesson-media\/[a-f0-9-]{36}$/.test(value)) return value;
    if (
      /^\/(?:learn\/chapters\/|topics(?:[?#]|$))/.test(value) &&
      !value.includes("\\") &&
      !/[\u0000-\u0020]/.test(value)
    )
      return value;
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) &&
      !!parsed.hostname &&
      !parsed.username &&
      !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Dedicated image validation; navigation links are never valid image sources. */
export function safeLessonImageUrl(value: string, allowLegacyHttp = false): string | null {
  if (/^\/api\/lesson-media\/[a-f0-9-]{36}$/.test(value)) return value;
  const safe = safeLessonUrl(value);
  return safe && (safe.startsWith("https:") || (allowLegacyHttp && safe.startsWith("http:")))
    ? safe
    : null;
}

function LessonImage({ url, alt, width, height }: { url: string; alt: string; width?:number;height?:number }) {
  const { t: translateUi } = useI18n();
  const identity = useNexusIdentity(),
    [loaded, setLoaded] = useState<{ source: string; owner: string; url: string } | null>(null),
    [failed, setFailed] = useState(false);
  const privateMedia = url.startsWith("/api/lesson-media/"),
    owner = identity ? identity.userId + ":" + identity.sessionId : "";
  const container=useRef<HTMLSpanElement>(null),[near,setNear]=useState(!privateMedia || typeof IntersectionObserver==="undefined");
  useEffect(()=>{
    if(!privateMedia || near || typeof IntersectionObserver==="undefined") return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:"400px"});
    if(container.current)observer.observe(container.current);return()=>observer.disconnect();
  },[privateMedia,near,url]);
  useEffect(() => {
    setFailed(false);
    if (!privateMedia || !near) return;
    const controller = new AbortController();
    let objectURL = "";
    setLoaded(null);
    setFailed(false);
    if (identity)
      void customFetch<Blob>(url, { responseType: "blob", signal: controller.signal, cache:"no-cache", credentials:"same-origin" })
        .then((blob) => {
          if (controller.signal.aborted) return;
          objectURL = URL.createObjectURL(blob);
          setLoaded({ source: url, owner, url: objectURL });
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [url, owner, privateMedia, near]);
  const source = privateMedia
    ? loaded?.source === url && loaded.owner === owner
      ? loaded.url
      : null
    : safeLessonImageUrl(url, true);
  const body = failed ? (
    <p role="note">
      {translateUi("Image could not load. Check the resource URL, access permissions and browser Network/CSP diagnostics. Upload storage may not be activated for private media.")}</p>
  ) : source ? (
    <img
      src={source}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <p role="note">{failed ? translateUi("Image unavailable.") : translateUi("Loading authenticated image…")}</p>
  );
  return <span ref={container} style={{display:"block",...(width&&height?{aspectRatio:`${width}/${height}`}:{minHeight:near?undefined:160})}}>{body}</span>;
}
function AnnotatedText({
  text,
  offset = 0,
  annotations,
}: {
  text: string;
  offset?: number;
  annotations: StudyAnnotation[];
}) {
  const cuts = new Set([0, text.length]);
  for (const a of annotations) {
    if (a.anchor) {
      cuts.add(Math.max(0, Math.min(text.length, a.anchor.start - offset)));
      cuts.add(Math.max(0, Math.min(text.length, a.anchor.end - offset)));
    }
  }
  const positions = [...cuts].sort((a, b) => a - b);
  return (
    <>
      {positions.slice(0, -1).map((start, i) => {
        const end = positions[i + 1],
          match = annotations.find(
            (a) => a.anchor && a.anchor.start <= offset + start && a.anchor.end >= offset + end,
          );
        const part = text.slice(start, end);
        return match ? (
          <mark
            key={start}
            className={`study-highlight study-color-${match.color}`}
            data-highlight-id={match.id}
          >
            {part}
          </mark>
        ) : (
          <span key={start}>{part}</span>
        );
      })}
    </>
  );
}
function RichRuns({
  runs,
  annotations = [],
}: {
  runs: Extract<LessonBlock, { type: "richText" }>["runs"];
  annotations?: StudyAnnotation[];
}) {
  let offset = 0;
  return (
    <>
      {runs.map((run, index) => {
        const at = offset;
        offset += run.text.length;
        let text: React.ReactNode = (
          <AnnotatedText text={run.text} offset={at} annotations={annotations} />
        );
        if (run.code) text = <code>{text}</code>;
        if (run.italic) text = <em>{text}</em>;
        if (run.bold) text = <strong>{text}</strong>;
        if (run.underline) text = <u>{text}</u>;
        if (run.strike) text = <s>{text}</s>;
        if (run.superscript) text = <sup>{text}</sup>;
        if (run.subscript) text = <sub>{text}</sub>;
        if (run.highlight)
          text = (
            <mark
              className="lesson-inline-highlight"
              style={{
                backgroundColor: highlightColors[run.highlight],
                color: textColors[run.color ?? "default"],
              }}
            >
              {text}
            </mark>
          );
        return (
          <span key={index} className={run.color ? `lesson-text-${run.color}` : undefined}>
            {run.href && safeLessonUrl(run.href) ? (
              <a
                href={safeLessonUrl(run.href)!}
                {...(run.href.startsWith("/")
                  ? {}
                  : { target: "_blank", rel: "noopener noreferrer" })}
              >
                {text}
              </a>
            ) : (
              text
            )}
          </span>
        );
      })}
    </>
  );
}
function CodeExample({
  text,
  language,
  lineNumbers,
  explanation,
}: {
  text: string;
  language: string;
  lineNumbers?: boolean;
  explanation?: string;
}) {
  const { t: translateUi, dir } = useI18n();
  const [message, setMessage] = useState("");
  return (
    <div className="lesson-code">
      <div dir={dir}>
        <span>{language || "Cisco CLI"}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setMessage("Copied");
            } catch {
              setMessage("Copy unavailable. Select and copy the code manually.");
            }
          }}
        >
          {translateUi("Copy code")}</button>
      </div>
      <pre tabIndex={0} dir="ltr">
        <code>
          {lineNumbers
            ? text.split("\n").map((line, i) => (
                <span className="visual-code-line" data-line={i + 1} key={i}>
                  {line}
                  {i < text.split("\n").length - 1 ? "\n" : ""}
                </span>
              ))
            : text}
        </code>
      </pre>
      <span role="status" dir={dir}><UiMessage text={message}/></span>
      {explanation && <p className="lesson-text" dir="auto">{explanation}</p>}
    </div>
  );
}
function KnowledgeCheck({ block }: { block: Extract<LessonBlock, { type: "knowledgeCheck" }> }) {
  const { t: translateUi, dir } = useI18n();
  const [choice, setChoice] = useState<number | null>(null),
    [checked, setChecked] = useState(false);
  return (
    <fieldset className="lesson-check">
      <legend>{block.prompt}</legend>
      {block.choices.map((text, i) => (
        <label key={i}>
          <input
            type="radio"
            name={block.id}
            checked={choice === i}
            onChange={() => {
              setChoice(i);
              setChecked(false);
            }}
          />
          {text}
        </label>
      ))}
      <button dir={dir} type="button" disabled={choice === null} onClick={() => setChecked(true)}>
        {translateUi("Check understanding")}</button>
      {checked && (
        <p role="status">
          <strong dir={dir}>{choice === block.correctIndex ? translateUi("Correct.") : translateUi("Review this concept.")}</strong>
          {block.explanation}
        </p>
      )}
      <small dir={dir}>{translateUi("Self-check only. This does not create a practice attempt.")}</small>
    </fieldset>
  );
}
export function SemanticLessonList({ block }: { block: Extract<LessonBlock, { type: "list" }> }) {
  let cursor = 0;
  const render = (level: number): React.ReactNode => {
    const children: React.ReactNode[] = [];
    while (cursor < block.items.length && (block.levels?.[cursor] ?? 0) >= level) {
      const at = cursor++,
        nested = (block.levels?.[cursor] ?? 0) > level ? render(level + 1) : null;
      children.push(
        <li key={at}>
          {block.itemRuns?.[at] ? <RichRuns runs={block.itemRuns[at]} /> : block.items[at]}
          {nested}
        </li>,
      );
    }
    const style = { listStyleType: block.numbering ?? (block.ordered ? "decimal" : "disc") };
    return block.ordered ? (
      <ol start={level === 0 ? block.start : 1} style={style}>
        {children}
      </ol>
    ) : (
      <ul style={style}>{children}</ul>
    );
  };
  return <>{render(0)}</>;
}
export function LessonContent({
  blocks,
  highlights = [],
  onBookmarkSection,
}: {
  blocks: LessonBlock[];
  highlights?: StudyAnnotation[];
  onBookmarkSection?: (id: string) => void;
}) {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi, dir } = useI18n();
  return (
    <>
      {blocks.map((block) => {
        const annotations = highlights.filter(
          (a) =>
            a.kind === "HIGHLIGHT" &&
            a.anchor?.blockId === block.id &&
            validAnchor(a.anchor, blocks),
        );
        return (
          <section
            className={`lesson-block ${"appearance" in block && block.appearance ? `visual-appearance visual-bg-${block.appearance.background ?? "paper"} visual-accent-${block.appearance.accent ?? "accent"} visual-padding-${block.appearance.padding ?? "cozy"} visual-spacing-${block.appearance.spacing ?? "normal"} ${block.appearance.card ? "visual-card" : ""} ${block.appearance.decoration ? "visual-quote-decoration" : ""}` : ""}`}
            id={`section-${block.id}`}
            key={block.id}
            data-section-id={block.id}
            dir={"direction" in block ? (block.direction ?? "auto") : "auto"}
          >
            {onBookmarkSection && (
              <button
                dir={dir}
                type="button"
                className="study-section-bookmark"
                onClick={() => onBookmarkSection(block.id)}
                aria-label={translateUi("Bookmark section {value0}", {value0: String(blocks.indexOf(block) + 1)})}
              >
                {translateUi("Bookmark section")}</button>
            )}
            {block.type === "heading" &&
              createElement(
                `h${block.level}`,
                {
                  "data-study-text": block.id,
                  style: { textAlign: block.alignment },
                },
                block.runs ? (
                  <RichRuns runs={block.runs} annotations={annotations} />
                ) : (
                  <AnnotatedText text={block.text} annotations={annotations} />
                ),
              )}
            {block.type === "paragraph" && (
              <p
                className="lesson-text"
                data-study-text={block.id}
                style={{ textAlign: block.alignment }}
              >
                {block.runs ? (
                  <RichRuns runs={block.runs} annotations={annotations} />
                ) : (
                  <AnnotatedText text={block.text} annotations={annotations} />
                )}
              </p>
            )}
            {block.type === "quote" && (
              <blockquote style={{ textAlign: block.alignment }}>
                <span className="lesson-text" data-study-text={block.id}>
                  {block.runs ? (
                    <RichRuns runs={block.runs} annotations={annotations} />
                  ) : (
                    <AnnotatedText text={block.text} annotations={annotations} />
                  )}
                </span>
                {block.attribution && <cite>{block.attribution}</cite>}
              </blockquote>
            )}
            {block.type === "list" && <SemanticLessonList block={block} />}
            {block.type === "richText" && (
              <p
                className="lesson-text"
                data-study-text={block.id}
                style={{ textAlign: block.alignment }}
              >
                <RichRuns runs={block.runs} annotations={annotations} />
              </p>
            )}
            {block.type === "callout" && (
              <aside
                className={`lesson-callout lesson-callout-${block.tone}`}
                style={{ textAlign: block.alignment }}
              >
                <strong dir={block.title ? undefined : dir}>
                  {block.showIcon !== false && (
                    <span aria-hidden="true">
                      {block.tone === "warning"
                        ? "⚠"
                        : block.tone === "tip"
                          ? "✓"
                          : block.tone === "important"
                            ? "!"
                            : "ⓘ"}{" "}
                    </span>
                  )}
                  {block.title ||
                    (block.tone === "warning"
                      ? translateUi("Take care")
                      : block.tone === "tip"
                        ? translateUi("Study tip")
                        : block.tone === "important"
                          ? translateUi("Important")
                          : block.tone === "example"
                            ? translateUi("Example")
                            : block.tone === "note"
                              ? translateUi("Note")
                              : translateUi("Information"))}
                </strong>
                <p className="lesson-text" data-study-text={block.id}>
                  {block.runs ? (
                    <RichRuns runs={block.runs} annotations={annotations} />
                  ) : (
                    <AnnotatedText text={block.text} annotations={annotations} />
                  )}
                </p>
              </aside>
            )}
            {block.type === "code" && (
              <CodeExample
                text={block.text}
                language={block.language}
                lineNumbers={block.lineNumbers}
                explanation={block.explanation}
              />
            )}
            {(block.type === "image" || block.type === "diagram") && (
              <figure
                className={`lesson-image-width-${block.width ?? "full"} lesson-image-align-${block.alignment ?? "center"}`}
              >
                {safeLessonImageUrl(block.url, true) ? (
                  <LessonImage url={block.url} alt={block.decorative ? "" : block.alt} width={block.pixelWidth} height={block.pixelHeight} />
                ) : (
                  <p role="note">{translateUi("Image unavailable: unsafe or invalid URL.")}</p>
                )}
                {block.caption && <figcaption>{block.caption}</figcaption>}
              </figure>
            )}
            {block.type === "table" && (
              <div
                className="lesson-table"
                role="region"
                aria-label={translateUi("Lesson reference table")}
                tabIndex={0}
              >
                <table className={`visual-columns-${block.columnWidth ?? "auto"}`}>
                  <thead>
                    <tr>
                      {block.headers.map((header, index) =>
                        block.headerRow === false ? (
                          <td
                            key={index}
                            className={`visual-bg-${block.cells?.find((c) => c.row === 0 && c.column === index)?.background ?? "paper"}`}
                            style={{
                              textAlign:
                                block.cells?.find((c) => c.row === 0 && c.column === index)
                                  ?.alignment ?? block.alignment,
                            }}
                          >
                            {header}
                          </td>
                        ) : (
                          <th
                            key={index}
                            scope="col"
                            className={
                              block.cells?.find((c) => c.row === 0 && c.column === index)
                                ?.background
                                ? `visual-bg-${block.cells?.find((c) => c.row === 0 && c.column === index)?.background}`
                                : undefined
                            }
                            style={{
                              textAlign:
                                block.cells?.find((c) => c.row === 0 && c.column === index)
                                  ?.alignment ?? block.alignment,
                            }}
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((cell, column) =>
                          block.headerColumn && column === 0 ? (
                            <th
                              key={column}
                              scope="row"
                              className={`visual-bg-${block.cells?.find((c) => c.row === index + 1 && c.column === column)?.background ?? "paper"}`}
                              style={{
                                textAlign:
                                  block.cells?.find(
                                    (c) => c.row === index + 1 && c.column === column,
                                  )?.alignment ?? block.alignment,
                              }}
                            >
                              {cell}
                            </th>
                          ) : (
                            <td
                              key={column}
                              className={`visual-bg-${block.cells?.find((c) => c.row === index + 1 && c.column === column)?.background ?? "paper"}`}
                              style={{
                                textAlign:
                                  block.cells?.find(
                                    (c) => c.row === index + 1 && c.column === column,
                                  )?.alignment ?? block.alignment,
                              }}
                            >
                              {cell}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {block.type === "knowledgeCheck" && <KnowledgeCheck block={block} />}
            {block.type === "labReference" && (
              <aside className="lesson-callout">
                <strong>{block.title}</strong>
                <p>{block.description}</p>
                {!!block.objectives?.length && (
                  <>
                    <h3 dir={dir}>{translateUi("Learning objectives")}</h3>
                    <ul>
                      {block.objectives.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </>
                )}
                {!!block.requirements?.length && (
                  <>
                    <h3 dir={dir}>{translateUi("Requirements")}</h3>
                    <ul>
                      {block.requirements.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ul>
                  </>
                )}
                {!!block.steps?.length && (
                  <>
                    <h3 dir={dir}>{translateUi("Steps")}</h3>
                    <ol>
                      {block.steps.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ol>
                  </>
                )}
                {block.expectedResults && (
                  <>
                    <h3 dir={dir}>{translateUi("Expected results")}</h3>
                    <p>{block.expectedResults}</p>
                  </>
                )}
                {block.url && safeLessonUrl(block.url) ? (
                  <a dir={dir} href={safeLessonUrl(block.url)!} target="_blank" rel="noopener noreferrer">
                    {translateUi("Open lab reference ↗")}</a>
                ) : block.url ? (
                  <p>{translateUi("Lab link unavailable.")}</p>
                ) : null}
                <small dir={dir}>
                  {translateUi("External reference only; no simulator or command execution is provided.")}</small>
              </aside>
            )}
          </section>
        );
      })}
    </>
  );
}
