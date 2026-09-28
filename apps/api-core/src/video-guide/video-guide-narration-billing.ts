import { createHash } from "node:crypto";

interface NarrationBillingNode {
  id: string;
  script: string;
}

interface NarrationBillingRates {
  baseCredits: number;
  creditsPerThousandCharacters: number;
}

export function narrationTtsCreditsForCompletedNodes(
  nodes: NarrationBillingNode[],
  completedNodeIds: ReadonlySet<string>,
  rates: NarrationBillingRates
) {
  const characters = nodes.reduce(
    (total, node) => total + (completedNodeIds.has(node.id) ? node.script.length : 0),
    0
  );

  if (characters <= 0) {
    return 0;
  }

  return (
    nonNegativeInteger(rates.baseCredits) +
    Math.ceil(characters / 1_000) * nonNegativeInteger(rates.creditsPerThousandCharacters)
  );
}

export function cumulativeNarrationTtsBilledCredits(input: {
  billedCreditsBeforeAttempt: number;
  latestAttemptConsumedCredits: number;
  totalCredits: number;
}) {
  return Math.min(
    nonNegativeInteger(input.totalCredits),
    nonNegativeInteger(input.billedCreditsBeforeAttempt) +
      nonNegativeInteger(input.latestAttemptConsumedCredits)
  );
}

export function remainingNarrationTtsCredits(totalCredits: number, billedCredits: number) {
  return Math.max(0, nonNegativeInteger(totalCredits) - nonNegativeInteger(billedCredits));
}

export function narrationTtsAttemptActualCredits(input: {
  billedCreditsBeforeAttempt: number;
  cumulativeCompletedCredits: number;
  totalCredits: number;
}) {
  const totalCredits = nonNegativeInteger(input.totalCredits);
  const billedCredits = Math.min(totalCredits, nonNegativeInteger(input.billedCreditsBeforeAttempt));
  const completedCredits = Math.min(totalCredits, nonNegativeInteger(input.cumulativeCompletedCredits));

  return Math.max(0, completedCredits - billedCredits);
}

export function narrationTtsBillingRevision(input: {
  billedCredits: number;
  checkpointId: string;
  draftRevision: string;
  modelAlias: string;
  totalCredits: number;
  voice: string;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.draftRevision.trim(),
        input.voice.trim(),
        input.modelAlias.trim(),
        input.checkpointId.trim(),
        nonNegativeInteger(input.totalCredits),
        nonNegativeInteger(input.billedCredits)
      ])
    )
    .digest("hex");
}

export function successfulNarrationNodeIds(progressValue: unknown) {
  const progress = isRecord(progressValue) ? progressValue : null;
  const nodes = progress && Array.isArray(progress.nodes) ? progress.nodes : [];

  return new Set(
    nodes.flatMap((value) => {
      const node = isRecord(value) ? value : null;
      const nodeId = typeof node?.nodeId === "string" ? node.nodeId.trim() : "";

      return nodeId && node?.status === "SUCCEEDED" ? [nodeId] : [];
    })
  );
}

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.ceil(value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
