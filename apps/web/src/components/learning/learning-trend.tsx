import { formatLearningDuration, type LearnerLearningOverview } from "@/lib/learner-learning-types";

export function LearningTrend({ daily }: { daily: LearnerLearningOverview["daily"] }) {
  const maxSeconds = Math.max(1, ...daily.map((day) => day.onlineSeconds));

  return (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label="最近 7 天学习趋势">
        {daily.map((day) => {
          const totalHeight = Math.max(2, (day.onlineSeconds / maxSeconds) * 100);
          const studyHeight = day.onlineSeconds > 0
            ? (day.studySeconds / day.onlineSeconds) * totalHeight
            : 0;
          const dateLabel = `${Number(day.date.slice(5, 7))}/${Number(day.date.slice(8, 10))}`;
          return (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={day.date}>
              <span className="sr-only">
                {day.date}，在线 {formatLearningDuration(day.onlineSeconds)}，学习 {formatLearningDuration(day.studySeconds)}
              </span>
              <div className="relative flex h-32 w-full max-w-10 items-end overflow-hidden rounded-md bg-secondary">
                <span
                  aria-hidden="true"
                  className="w-full rounded-md bg-primary/30"
                  style={{ height: `${totalHeight}%` }}
                />
                {studyHeight > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 rounded-md bg-primary"
                    style={{ height: `${studyHeight}%` }}
                  />
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">{dateLabel}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary/30" />在线</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-primary" />学习</span>
      </div>
    </div>
  );
}
