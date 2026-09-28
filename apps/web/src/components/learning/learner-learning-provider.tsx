"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createLearningTracker } from "@/lib/learner-learning-tracker";
import type {
  LearningContext,
  LearningEventInput,
  LearningTracker
} from "@/lib/learner-learning-types";

export const learningContextEventName = "xueleai:learning-context";
export const learningEventName = "xueleai:learning-event";

export function publishLearningContext(context: LearningContext) {
  window.dispatchEvent(
    new CustomEvent<LearningContext>(learningContextEventName, { detail: context })
  );
}

export function publishLearningEvent(event: LearningEventInput) {
  window.dispatchEvent(
    new CustomEvent<LearningEventInput>(learningEventName, { detail: event })
  );
}

export function LearnerLearningProvider({
  children,
  enabled,
  context = { isLearning: false }
}: {
  children: ReactNode;
  enabled: boolean;
  context?: LearningContext;
}) {
  const trackerRef = useRef<LearningTracker | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const tracker = createLearningTracker();
    trackerRef.current = tracker;
    tracker.updateContext(context);

    const interact = () => tracker.recordInteraction(new Date());
    const visible = () => tracker.setPageVisible(document.visibilityState === "visible");
    const focus = () => tracker.setHasFocus(true);
    const blur = () => tracker.setHasFocus(false);
    const online = () => void tracker.start();
    const onContext = (event: Event) => {
      tracker.updateContext((event as CustomEvent<LearningContext>).detail);
    };
    const onLearningEvent = (event: Event) => {
      tracker.enqueue((event as CustomEvent<LearningEventInput>).detail);
      interact();
    };
    const onMediaPlay = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) tracker.setMediaPlaying(true);
    };
    const onMediaPause = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) tracker.setMediaPlaying(false);
    };

    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    window.addEventListener("online", online);
    window.addEventListener("pointerdown", interact, { passive: true });
    window.addEventListener("keydown", interact);
    window.addEventListener("scroll", interact, { passive: true });
    window.addEventListener(learningContextEventName, onContext);
    window.addEventListener(learningEventName, onLearningEvent);
    document.addEventListener("play", onMediaPlay, true);
    document.addEventListener("pause", onMediaPause, true);
    document.addEventListener("ended", onMediaPause, true);
    void tracker.start();

    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      window.removeEventListener("online", online);
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", interact);
      window.removeEventListener("scroll", interact);
      window.removeEventListener(learningContextEventName, onContext);
      window.removeEventListener(learningEventName, onLearningEvent);
      document.removeEventListener("play", onMediaPlay, true);
      document.removeEventListener("pause", onMediaPause, true);
      document.removeEventListener("ended", onMediaPause, true);
      void tracker.stop();
      trackerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    trackerRef.current?.updateContext(context);
  }, [context]);

  return children;
}
