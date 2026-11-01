import { useState } from "react";
import { AdminButton, AdminEmptyState, AdminSearch } from "./admin-ui";
import {
  bookChapterReference,
  ccnaBookChapters,
  ccnaBookDomains,
  filterBookDomains,
  type BookVolume,
} from "../lib/ccna-book-chapters";
import "../taxonomy-book-chapters.css";

const copy = {
  en: {
    title: "Book chapters",
    subtitle: "CCNA 200-301 v1.1 · Official Cert Guide, Volumes 1 & 2",
    intro:
      "These 48 chapters are the canonical educational taxonomy. Manage chapter availability and descriptions in Manage chapters.",
    domains: "exam domains",
    chapters: "chapters",
    v1: "Volume 1",
    v2: "Volume 2",
    weight: "Exam weight",
    totalWeight: "Total exam weight",
    search: "Search book chapters",
    placeholder: "Search chapter titles, numbers or domains",
    volume: "Book volume",
    all: "All volumes",
    clear: "Clear filters",
    book: "Book",
    chapter: "Chapter",
    chapterTitle: "Chapter title",
    primary: "Primary chapters",
    showing: "Showing",
    of: "of",
    empty: "No matching chapters",
    emptyHelp: "Try a different chapter title, number or volume.",
    source:
      "Chapter titles and primary domains follow the supplied book classification. Book edition not specified. Exam weights are independent of chapter counts.",
  },
  ar: {
    title: "فصول الكتاب",
    subtitle: "CCNA 200-301 v1.1 · Official Cert Guide، المجلدان الأول والثاني",
    intro:
      "فصول الكتاب مرجع للدراسة. تُدار أهداف الامتحان الرسمية وارتباطات الأسئلة في العرضين الآخرين.",
    domains: "مجالات الامتحان",
    chapters: "فصلًا",
    v1: "المجلد الأول",
    v2: "المجلد الثاني",
    weight: "وزن الامتحان",
    totalWeight: "مجموع أوزان الامتحان",
    search: "البحث في فصول الكتاب",
    placeholder: "ابحث بعنوان الفصل أو رقمه أو مجال الامتحان",
    volume: "مجلد الكتاب",
    all: "جميع المجلدات",
    clear: "مسح عوامل التصفية",
    book: "الكتاب",
    chapter: "الفصل",
    chapterTitle: "عنوان الفصل",
    primary: "الفصول الأساسية",
    showing: "عرض",
    of: "من",
    empty: "لا توجد فصول مطابقة",
    emptyHelp: "جرّب عنوان فصل أو رقمًا أو مجلدًا آخر.",
    source:
      "تتبع العناوين والمجالات الأساسية تصنيف الكتاب المقدم. لم تُحدَّد طبعة الكتاب. أوزان الامتحان مستقلة عن أعداد الفصول.",
  },
} as const;
export function bookChapterLocale() {
  return document.documentElement.lang.toLowerCase().startsWith("ar") ? "ar" : "en";
}
export function TaxonomyBookChapters() {
  const locale = bookChapterLocale(),
    t = copy[locale];
  const [search, setSearch] = useState(""),
    [volume, setVolume] = useState<"ALL" | BookVolume>("ALL");
  const filtered = filterBookDomains(search, volume),
    visible = filtered.reduce((n, d) => n + d.chapters.length, 0);
  const reset = () => {
    setSearch("");
    setVolume("ALL");
  };
  return (
    <section
      className="taxonomy-book-view"
      aria-labelledby="book-reference-title"
      lang={locale}
      dir={locale === "ar" ? "rtl" : undefined}
    >
      <header className="book-reference-header">
        <div>
          <p className="book-reference-kicker">{t.subtitle}</p>
          <h2 id="book-reference-title">{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <dl className="book-reference-summary" aria-label={t.title}>
          <div>
            <dt>{t.domains}</dt>
            <dd>{ccnaBookDomains.length}</dd>
          </div>
          <div>
            <dt>{t.chapters}</dt>
            <dd>{ccnaBookChapters.length}</dd>
          </div>
          <div>
            <dt>{t.v1}</dt>
            <dd>{ccnaBookChapters.filter((c) => c.volume === "V1").length}</dd>
          </div>
          <div>
            <dt>{t.v2}</dt>
            <dd>{ccnaBookChapters.filter((c) => c.volume === "V2").length}</dd>
          </div>
          <div>
            <dt>{t.totalWeight}</dt>
            <dd>{ccnaBookDomains.reduce((n, d) => n + d.examWeight, 0)}%</dd>
          </div>
        </dl>
      </header>
      <div className="book-reference-toolbar">
        <AdminSearch
          label={t.search}
          placeholder={t.placeholder}
          value={search}
          onChange={setSearch}
        />
        <label className="book-volume-filter">
          <span>{t.volume}</span>
          <select value={volume} onChange={(e) => setVolume(e.target.value as "ALL" | BookVolume)}>
            <option value="ALL">{t.all}</option>
            <option value="V1">V1 · {t.v1}</option>
            <option value="V2">V2 · {t.v2}</option>
          </select>
        </label>
        {(search || volume !== "ALL") && (
          <AdminButton type="button" variant="outline" onClick={reset}>
            {t.clear}
          </AdminButton>
        )}
      </div>
      <p className="book-reference-results" role="status" aria-live="polite">
        {t.showing} {visible} {t.of} {ccnaBookChapters.length} {t.chapters}
      </p>
      {!filtered.length && (
        <AdminEmptyState
          title={t.empty}
          description={t.emptyHelp}
          action={
            <AdminButton type="button" variant="outline" onClick={reset}>
              {t.clear}
            </AdminButton>
          }
        />
      )}
      {filtered.map((d) => (
        <section
          className="book-domain-section"
          key={d.code}
          aria-labelledby={`book-domain-${d.code}`}
        >
          <header className="book-domain-header">
            <div className="book-domain-identity">
              <span className="book-domain-code" dir="ltr">
                {d.code}
              </span>
              <div>
                <h3 id={`book-domain-${d.code}`} lang="en">
                  <bdi dir="ltr">{d.name}</bdi>
                </h3>
                <p>
                  {ccnaBookDomains.find((original) => original.code === d.code)!.chapters.length}{" "}
                  {t.chapters} <span>· {t.primary}</span>
                </p>
              </div>
            </div>
            <div className="book-domain-weight">
              <strong>{d.examWeight}%</strong>
              <span>{t.weight}</span>
            </div>
          </header>
          <table className="book-chapter-table">
            <caption className="sr-only">
              {d.code} {d.name} — {t.title}
            </caption>
            <colgroup>
              <col className="book-volume-column" />
              <col className="book-number-column" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{t.book}</th>
                <th scope="col">{t.chapter}</th>
                <th scope="col">{t.chapterTitle}</th>
              </tr>
            </thead>
            <tbody>
              {d.chapters.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span
                      className="book-volume-badge"
                      data-volume={c.volume}
                      aria-label={c.volume === "V1" ? t.v1 : t.v2}
                      dir="ltr"
                    >
                      {c.volume}
                    </span>
                  </td>
                  <td className="book-chapter-number">
                    <bdi dir="ltr">{c.chapterNumber}</bdi>
                  </td>
                  <th scope="row" lang="en">
                    <bdi dir="ltr">{c.title}</bdi>
                  </th>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="book-reference-source" data-reference-version={bookChapterReference.revision}>
        {t.source}
      </p>
    </section>
  );
}
