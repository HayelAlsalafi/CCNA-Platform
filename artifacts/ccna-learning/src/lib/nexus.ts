import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { nexusRequest, getCommandCenterAnalytics, type NexusAnalytics, type NexusTopic } from "@workspace/api-client-react";
import { progressIdentity, sessionQueryKey } from "./learning-progress-cache";
export const accuracy = (correct: number, attempts: number) =>
  attempts ? Math.round((correct / attempts) * 100) : null;
export function recommendTopic(topics: NexusTopic[]) {
  return (
    [...topics]
      .filter((t) => t.available > 0 && ((t.attempts >= 5 && t.correct / t.attempts < 0.7) || t.attempted < t.available))
      .sort((a, b) => {
        const aw = a.attempts >= 5 && a.correct / a.attempts < 0.7,
          bw = b.attempts >= 5 && b.correct / b.attempts < 0.7;
        if (aw !== bw) return aw ? -1 : 1;
        if (aw && bw) return a.correct / a.attempts - b.correct / b.attempts || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        return (
          b.available - b.attempted - (a.available - a.attempted) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        );
      })[0] ?? null
  );
}
export function useNexusIdentity() {
  return progressIdentity(useAuth());
}
export function useNexusAnalytics(range = "30") {
  const identity = useNexusIdentity();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useQuery({
    queryKey: sessionQueryKey(["/api/nexus/analytics", range, timezone], identity),
    enabled: !!identity,
    gcTime: 0,
    retry: false,
    placeholderData: () => undefined,
    queryFn: ({ signal }): Promise<NexusAnalytics> => {
      const supported = (["7", "30", "90", "all"] as const).find(value => value === range);
      if (!supported) throw new Error("Unsupported analytics period.");
      return getCommandCenterAnalytics({ range: supported, timezone }, { signal, credentials: "same-origin", cache: "no-store" });
    },
  });
}
export function useNexusLifetime() {
  const identity = useNexusIdentity(),
    actor = useRef(identity),
    generation = useRef(0),
    mounted = useRef(false);
  actor.current = identity;
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, []);
  return {
    identity,
    capture: () => {
      const id = identity,
        run = generation.current;
      return () =>
        mounted.current &&
        run === generation.current &&
        !!id &&
        actor.current?.userId === id.userId &&
        actor.current?.sessionId === id.sessionId;
    },
  };
}
export function nexusError(error: unknown) {
  const e = error as { data?: { error?: { message?: string } } };
  return (
    e?.data?.error?.message ||
    "Request failed. Your recorded answers are retained; refresh before retrying."
  );
}
