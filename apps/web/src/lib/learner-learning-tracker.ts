import {
  endLearningSession,
  sendLearningEvents,
  sendLearningHeartbeat,
  startLearningSession
} from "./learner-learning-client";
import type {
  LearningContext,
  LearningEventInput,
  LearningTracker,
  QueuedLearningEvent
} from "./learner-learning-types";

const heartbeatIntervalMilliseconds = 30_000;
const idleMilliseconds = 120_000;
const eventQueueLimit = 200;
const queueStorageKey = "xueleai:learner-learning-events";
const clientSessionStorageKey = "xueleai:learner-learning-client-session";
const leaderChannelName = "xueleai-learner-learning";

export interface TrackerState {
  pageVisible: boolean;
  hasFocus: boolean;
  mediaPlaying: boolean;
  lastInteractionAt: Date;
  context: LearningContext;
}

export interface LearningEventQueue {
  nextSequence: number;
  events: QueuedLearningEvent[];
}

export function createTrackerState(now: Date): TrackerState {
  return {
    pageVisible: true,
    hasFocus: true,
    mediaPlaying: false,
    lastInteractionAt: now,
    context: { isLearning: false }
  };
}

export function recordInteraction(state: TrackerState, at: Date): TrackerState {
  return { ...state, lastInteractionAt: at };
}

export function heartbeatPayload(state: TrackerState, now: Date) {
  const idleFor = now.getTime() - state.lastInteractionAt.getTime();
  const active =
    state.pageVisible &&
    (state.hasFocus || state.mediaPlaying) &&
    idleFor >= 0 &&
    (state.mediaPlaying || idleFor <= idleMilliseconds);
  return {
    active,
    clientSentAt: now.toISOString(),
    pageVisible: state.pageVisible,
    hasFocus: state.hasFocus,
    mediaPlaying: state.mediaPlaying,
    lastInteractionAt: state.lastInteractionAt.toISOString(),
    context: state.context
  };
}

export function emptyEventQueue(): LearningEventQueue {
  return { nextSequence: 1, events: [] };
}

export function nextLearningEvent(
  queue: LearningEventQueue,
  payload: LearningEventInput,
  now = new Date(),
  context: LearningContext = { isLearning: false }
) {
  const event: QueuedLearningEvent = {
    ...payload,
    eventId: createId(),
    sequence: queue.nextSequence,
    occurredAt: now.toISOString(),
    context
  };
  return {
    event,
    queue: {
      nextSequence: queue.nextSequence + 1,
      events: [...queue.events, event].slice(-eventQueueLimit)
    }
  };
}

export function retryLearningEvent(queue: LearningEventQueue, eventId: string) {
  return queue.events.find((event) => event.eventId === eventId) ?? null;
}

interface TrackerOptions {
  now?: () => Date;
  storage?: Pick<Storage, "getItem" | "setItem">;
  window?: Window;
}

interface LeaderMessage {
  type: "presence" | "leave";
  tabId: string;
  createdAt: number;
  visible: boolean;
  lastActiveAt: number;
}

class TabLeaderElection {
  private readonly tabId = createId();
  private readonly createdAt = Date.now();
  private readonly peers = new Map<string, LeaderMessage>();
  private readonly channel: BroadcastChannel | null;
  private visible = true;
  private lastActiveAt = Date.now();

  constructor() {
    this.channel = typeof BroadcastChannel === "undefined"
      ? null
      : new BroadcastChannel(leaderChannelName);
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<LeaderMessage>) => {
        const message = event.data;
        if (!message || message.tabId === this.tabId) return;
        if (message.type === "leave") this.peers.delete(message.tabId);
        else this.peers.set(message.tabId, message);
      };
    }
    this.broadcast();
  }

  update(visible: boolean, lastActiveAt: number) {
    this.visible = visible;
    this.lastActiveAt = lastActiveAt;
    this.broadcast();
  }

  isLeader(now: number) {
    const candidates = [
      {
        type: "presence" as const,
        tabId: this.tabId,
        createdAt: this.createdAt,
        visible: this.visible,
        lastActiveAt: this.lastActiveAt
      },
      ...this.peers.values()
    ]
      .filter(
        (peer) => peer.visible && now - peer.lastActiveAt <= idleMilliseconds + 15_000
      )
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt || left.tabId.localeCompare(right.tabId)
      );
    return candidates[0]?.tabId === this.tabId;
  }

  close() {
    this.channel?.postMessage({
      type: "leave",
      tabId: this.tabId,
      createdAt: this.createdAt,
      visible: false,
      lastActiveAt: this.lastActiveAt
    } satisfies LeaderMessage);
    this.channel?.close();
  }

  private broadcast() {
    this.channel?.postMessage({
      type: "presence",
      tabId: this.tabId,
      createdAt: this.createdAt,
      visible: this.visible,
      lastActiveAt: this.lastActiveAt
    } satisfies LeaderMessage);
  }
}

export function createLearningTracker(options: TrackerOptions = {}): LearningTracker {
  const browserWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  const storage = options.storage ?? browserWindow?.sessionStorage;
  const now = options.now ?? (() => new Date());
  let state = createTrackerState(now());
  let queue = loadQueue(storage);
  let heartbeatSequence = 0;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let sessionId: string | null = null;
  let stopped = true;
  let starting: Promise<void> | null = null;
  const leader = new TabLeaderElection();
  const clientSessionKey = loadClientSessionKey(storage);

  const persistQueue = () => {
    storage?.setItem(queueStorageKey, JSON.stringify(queue));
  };

  const ensureSession = async () => {
    if (sessionId || starting) {
      await starting;
      return;
    }
    starting = startLearningSession(clientSessionKey)
      .then((session) => {
        sessionId = session.id;
      })
      .finally(() => {
        starting = null;
      });
    await starting;
  };

  const scheduleRetry = () => {
    if (retryTimer || stopped) return;
    const seconds = Math.min(30, 2 ** Math.min(retryAttempt, 4));
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void flushEvents();
    }, seconds * 1000);
  };

  const flushEvents = async () => {
    if (queue.events.length === 0 || !browserWindow?.navigator.onLine) return;
    try {
      await ensureSession();
      if (!sessionId) return;
      const batch = queue.events.slice(0, 50);
      const result = await sendLearningEvents(sessionId, batch);
      const accepted = new Set(result.acceptedEventIds);
      queue = {
        ...queue,
        events: queue.events.filter((event) => !accepted.has(event.eventId))
      };
      retryAttempt = 0;
      persistQueue();
      if (queue.events.length > 0) void flushEvents();
    } catch {
      scheduleRetry();
    }
  };

  const tick = async () => {
    const current = now();
    leader.update(state.pageVisible, state.lastInteractionAt.getTime());
    if (stopped || !leader.isLeader(current.getTime()) || !browserWindow?.navigator.onLine) {
      return;
    }
    try {
      await ensureSession();
      if (!sessionId) return;
      heartbeatSequence += 1;
      const payload = heartbeatPayload(state, current);
      await sendLearningHeartbeat(sessionId, {
        sequence: heartbeatSequence,
        clientSentAt: payload.clientSentAt,
        pageVisible: payload.pageVisible,
        hasFocus: payload.hasFocus,
        mediaPlaying: payload.mediaPlaying,
        lastInteractionAt: payload.lastInteractionAt,
        context: payload.context
      });
      await flushEvents();
    } catch {
      // 在线时长不补发；明确学习事件由独立队列重试。
    }
  };

  return {
    async start() {
      if (!stopped) return;
      stopped = false;
      leader.update(state.pageVisible, state.lastInteractionAt.getTime());
      interval = setInterval(() => void tick(), heartbeatIntervalMilliseconds);
      void flushEvents();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      if (interval) clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
      leader.close();
      if (sessionId) {
        try {
          await endLearningSession(sessionId, true);
        } catch {
          // 页面离开时的结束请求为尽力发送，服务端超时任务负责兜底。
        }
      }
    },
    recordInteraction(at) {
      state = recordInteraction(state, at);
      leader.update(state.pageVisible, at.getTime());
    },
    updateContext(context) {
      state = { ...state, context };
    },
    enqueue(payload) {
      const next = nextLearningEvent(queue, payload, now(), state.context);
      queue = next.queue;
      persistQueue();
      void flushEvents();
    },
    setPageVisible(visible) {
      state = { ...state, pageVisible: visible };
      leader.update(visible, state.lastInteractionAt.getTime());
    },
    setHasFocus(hasFocus) {
      state = { ...state, hasFocus };
    },
    setMediaPlaying(mediaPlaying) {
      state = { ...state, mediaPlaying };
    }
  };
}

function loadQueue(storage?: Pick<Storage, "getItem" | "setItem">): LearningEventQueue {
  try {
    const parsed = JSON.parse(storage?.getItem(queueStorageKey) ?? "null") as
      | LearningEventQueue
      | null;
    if (
      parsed &&
      Number.isSafeInteger(parsed.nextSequence) &&
      parsed.nextSequence > 0 &&
      Array.isArray(parsed.events)
    ) {
      return { ...parsed, events: parsed.events.slice(-eventQueueLimit) };
    }
  } catch {
    // 损坏的本地队列直接丢弃，避免阻塞新学习记录。
  }
  return emptyEventQueue();
}

function loadClientSessionKey(storage?: Pick<Storage, "getItem" | "setItem">) {
  const current = storage?.getItem(clientSessionStorageKey);
  if (current && current.length >= 16 && current.length <= 80) return current;
  const created = createId();
  storage?.setItem(clientSessionStorageKey, created);
  return created;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `learning-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
