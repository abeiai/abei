import type { Prisma } from "@xueleai/database";

export function resolveTypingStage(
  explicitStage: string | null | undefined,
  textbookEducationType: string | null | undefined
) {
  if (explicitStage) return explicitStage;
  if (!textbookEducationType) return null;
  if (textbookEducationType.startsWith("PRIMARY")) return "PRIMARY";
  if (textbookEducationType.startsWith("JUNIOR")) return "JUNIOR_HIGH";
  if (textbookEducationType === "SENIOR") return "SENIOR_HIGH";
  return "OTHER";
}

export function typingLibraryStageWhere(stage: string): Prisma.EnglishContentLibraryWhereInput {
  if (stage === "UNIVERSITY") return { educationStage: "UNIVERSITY" };
  if (stage === "PRIMARY") {
    return explicitOrTextbookStage("PRIMARY", { in: ["PRIMARY", "PRIMARY_FIVE_FOUR"] });
  }
  if (stage === "JUNIOR_HIGH") {
    return explicitOrTextbookStage("JUNIOR_HIGH", { in: ["JUNIOR", "JUNIOR_FIVE_FOUR"] });
  }
  if (stage === "SENIOR_HIGH") return explicitOrTextbookStage("SENIOR_HIGH", "SENIOR");
  if (stage === "OTHER") return explicitOrTextbookStage("OTHER", "SPECIAL_EDUCATION");
  return { id: { equals: "__unknown_typing_stage__" } };
}

export function typingSessionTargetCount(
  educationStage: string | null | undefined,
  requestedCount: number
) {
  return educationStage === "UNIVERSITY" && requestedCount === 0 ? 20 : requestedCount;
}

function explicitOrTextbookStage(
  stage: "PRIMARY" | "JUNIOR_HIGH" | "SENIOR_HIGH" | "OTHER",
  educationType: NonNullable<Prisma.LearningMaterialTextbookWhereInput["educationType"]>
): Prisma.EnglishContentLibraryWhereInput {
  return {
    OR: [
      { educationStage: stage },
      { educationStage: null, sourceTextbook: { educationType } }
    ]
  };
}
