import { UiMessage } from '../i18n';
import { useI18n } from '../i18n';
import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { CheckCircle2, Layers3, Activity, Target } from "lucide-react";
import { useNexusIdentity, nexusError, accuracy } from "../lib/nexus";
import {
  YearlyActivity,
  SkillMatrix,
  AchievementGallery,
  useLearnerProgress,
} from "../components/learning-evidence";
import { NetworkHero, LearningMetricCard } from "../components/nexus-visuals";
import { Skeleton } from "../components/ui/skeleton";
export function LearnerProfile() {
  const identity = useNexusIdentity();
  return <ProfileActor key={identity ? identity.userId + ":" + identity.sessionId : "anonymous"} />;
}
function ProfileActor() {
  const { t: translateUi } = useI18n();
  const identity = useNexusIdentity(),
    { user } = useUser(),
    query = useLearnerProgress(),
    data = query.data,
    name =
      identity && user?.id === identity.userId
        ? user.fullName || user.firstName || translateUi("Learner")
        : translateUi("Learner");
  return (
    <div className="nexus-page">
      <NetworkHero
        compact
        eyebrow={translateUi("YOUR LEARNING IDENTITY")}
        title={translateUi('{name}’s learning profile',{name})}
        description={translateUi("A private record of your networking practice, evidence and verified achievements.")}
      />
      {!identity ? (
        <section className="nexus-panel">
          <h2>{translateUi("Your learning profile is private")}</h2>
          <Link className="nexus-button" href="/sign-in">
            {translateUi("Sign in")}</Link>
        </section>
      ) : query.isPending ? (
        <Skeleton className="h-80" />
      ) : query.isError ? (
        <section role="alert" className="nexus-panel">
          <p><UiMessage text={nexusError(query.error)}/></p>
          <button className="nexus-button" onClick={() => void query.refetch()}>
            {translateUi("Retry progress")}</button>
        </section>
      ) : (
        data && (
          <>
            <div className="nexus-metrics">
              <LearningMetricCard
                label={translateUi("Verified submissions")}
                value={data.evidence.attempts}
                detail="Revision-bound own-history evidence"
                icon={<CheckCircle2 size={18} />}
              />
              <LearningMetricCard
                label={translateUi("Distinct questions")}
                value={data.evidence.unique}
                detail="Repeated answers count once for coverage"
                icon={<Layers3 size={18} />}
              />
              <LearningMetricCard
                label={translateUi("Tracked completions")}
                value={data.capabilities.sessions ? data.evidence.sessions : "Unavailable"}
                detail="No legacy session grouping is invented"
                icon={<Activity size={18} />}
              />
              <LearningMetricCard
                label={translateUi("Overall accuracy")}
                value={
                  accuracy(data.evidence.correct, data.evidence.attempts) === null
                    ? "—"
                    : accuracy(data.evidence.correct, data.evidence.attempts) + "%"
                }
                detail={data.evidence.correct + "/" + data.evidence.attempts + " correct"}
                icon={<Target size={18} />}
              />
            </div>
            {(data.evidence.legacyAnswers || 0) > 0 && (
              <p className="nexus-panel">
                {data.evidence.legacyAnswers} {translateUi("legacy answers remain in history and activity but are excluded from revision-verified skill and achievement evidence.")}</p>
            )}
            <YearlyActivity />
            <SkillMatrix data={data} />
            <AchievementGallery data={data} />
          </>
        )
      )}
    </div>
  );
}
