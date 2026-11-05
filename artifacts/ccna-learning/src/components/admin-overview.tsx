import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
import { AdminLearners } from "./admin-learners";
import { Link } from "wouter";
import { ArrowRight, BookOpen, FileQuestion, FolderTree, Upload } from "lucide-react";
import {
  useAdminListTopics,
  useAdminListQuestions,
  getAdminListTopicsQueryKey,
  getAdminListQuestionsQueryKey,
} from "@workspace/api-client-react";
import { useAdminSession } from "./admin-session-boundary";
import { adminQueryOptions } from "../lib/admin-session";
import { useTaxonomyCatalog } from "./admin-taxonomy";
import { AdminPanel, AdminLoading, AdminEmptyState, adminModules } from "./admin-ui";

export function AdminOverview() {
  const {message:localizeUiLabel}=useI18n();

  const { t: translateUi } = useI18n();
  const session = useAdminSession(),
    params = { limit: 1, offset: 0 };
  const topics = useAdminListTopics(
    adminQueryOptions(getAdminListTopicsQueryKey(), session.identity),
  );
  const questions = useAdminListQuestions(
    params,
    adminQueryOptions(getAdminListQuestionsQueryKey(params), session.identity),
  );
  const taxonomy = useTaxonomyCatalog();
  const stats = [
    { label: "Curriculum topics", value: topics.data?.length, query: topics, icon: BookOpen },
    { label: "Question bank", value: questions.data?.total, query: questions, icon: FileQuestion },
    {
      label: "Exam blueprints",
      value: taxonomy.data?.blueprints.length,
      query: taxonomy,
      icon: FolderTree,
    },
    {
      label: "Book chapters",
      value: taxonomy.data?.chapters?.length,
      query: taxonomy,
      icon: FolderTree,
    },
  ];
  return (
    <>
      <section className="admin-stat-grid" aria-label={translateUi("Content statistics")}>
        {stats.map(({ label, value, query, icon: Icon }) => (
          <article className="admin-stat-card" key={label}>
            <Icon aria-hidden="true" />
            <span><UiMessage text={String(label)}/></span>
            {query.isPending ? (
              <AdminLoading label={translateUi("Loading {value0}", {value0: localizeUiLabel(String(label))})} />
            ) : query.isError ? (
              <div className="stat-unavailable">
                {translateUi("Unavailable")}{" "}
                <button type="button" onClick={() => void query.refetch()}>
                  {translateUi("Retry")}</button>
              </div>
            ) : (
              <strong>{value ?? translateUi("Unavailable")}</strong>
            )}
          </article>
        ))}
      </section>
      <AdminPanel
        title={translateUi("Your administration workspace")}
        description={translateUi("Choose a module to organize, review or add learning content.")}
      >
        <div className="admin-module-grid">
          {adminModules.slice(1).map((m, i) => {
            const Icon = [BookOpen, FileQuestion, FolderTree, Upload, BookOpen][i] ?? BookOpen;
            return (
              <Link key={m.href} href={m.href} className="admin-module-card">
                <span className="admin-module-icon">
                  <Icon aria-hidden="true" />
                </span>
                <h3><UiMessage text={m.title}/></h3>
                <p><UiMessage text={m.description}/></p>
                <span>
                  {translateUi("Open")}{" "}{m.title.toLowerCase()} <ArrowRight aria-hidden="true" size={16} />
                </span>
              </Link>
            );
          })}
        </div>
      </AdminPanel>
      {!questions.isPending && !questions.isError && questions.data?.total === 0 && (
        <AdminEmptyState
          title={translateUi("Start building your question bank")}
          description={translateUi("Create a topic first, then write questions or preview a CSV/Excel import.")}
          action={
            <Link className="button-primary" href="/admin/topics">
              {translateUi("Manage topics")}</Link>
          }
        />
      )}
      <AdminLearners />
      <Link href="/admin/users">{translateUi("GLOBAL user and role administration")}</Link>
      <AdminPanel title={translateUi("A deliberate content workflow")}>
        <ol className="admin-workflow">
          <li>
            <strong>{translateUi("Organize")}</strong>
            <span>{translateUi("Set up topics and reviewed taxonomy records.")}</span>
          </li>
          <li>
            <strong>{translateUi("Review")}</strong>
            <span>{translateUi("Check question content and select its canonical book chapter.")}</span>
          </li>
          <li>
            <strong>{translateUi("Publish")}</strong>
            <span>{translateUi("Imports stay disabled drafts until you activate them in Questions.")}</span>
          </li>
        </ol>
        <p className="admin-muted">
          {translateUi("Coverage analytics and import history are future capabilities; no statistics for those features are available yet.")}</p>
      </AdminPanel>
    </>
  );
}
