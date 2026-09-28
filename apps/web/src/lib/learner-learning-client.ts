import type {
  LearningContext,
  QueuedLearningEvent
} from "./learner-learning-types";

interface LearningHeartbeatInput {
  sequence: number;
  clientSentAt: string;
  pageVisible: boolean;
  hasFocus: boolean;
  mediaPlaying: boolean;
  lastInteractionAt: string;
  context: LearningContext;
}

async function learningFetch<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    credentials: "same-origin",
    keepalive: init.keepalive
  });
  const payload = (await response.json()) as {
    code: number;
    message: string;
    data: T | null;
  };
  if (!response.ok || payload.code !== 0 || payload.data === null) {
    throw new Error(payload.message || "学习记录同步失败，请稍后重试");
  }
  return payload.data;
}

export function startLearningSession(clientSessionKey: string) {
  return learningFetch<{ id: string }>("/api/profiles/learner/learning/sessions", {
    method: "POST",
    body: JSON.stringify({ clientSessionKey })
  });
}

export function sendLearningHeartbeat(sessionId: string, input: LearningHeartbeatInput) {
  return learningFetch<{
    id: string;
    sequence: number;
    acceptedSeconds: number;
    active: boolean;
  }>(`/api/profiles/learner/learning/sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function sendLearningEvents(sessionId: string, events: QueuedLearningEvent[]) {
  return learningFetch<{ acceptedEventIds: string[] }>(
    `/api/profiles/learner/learning/sessions/${encodeURIComponent(sessionId)}/events`,
    {
      method: "POST",
      body: JSON.stringify({ events })
    }
  );
}

export function endLearningSession(sessionId: string, keepalive = false) {
  return learningFetch<{ id: string }>(
    `/api/profiles/learner/learning/sessions/${encodeURIComponent(sessionId)}/end`,
    { method: "POST", body: "{}", keepalive }
  );
}
