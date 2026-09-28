export type ProfileMode = "ACCOUNT" | "LEARNER";

export type ProfileSubject =
  | { userId: string; mode: "ACCOUNT"; learnerId: null }
  | { userId: string; mode: "LEARNER"; learnerId: string };

export interface PublicLearnerProfile {
  id: string;
  nickname: string;
  grade: string;
  gradeLabel: string;
  avatarUrl: string | null;
}

export type PublicProfileContext =
  | { mode: "ACCOUNT"; learnerId: null; learner: null }
  | { mode: "LEARNER"; learnerId: string; learner: PublicLearnerProfile };

export interface ProfileContextTransition {
  token: string;
  maxAgeSeconds: number;
  context: PublicProfileContext;
}

export interface ProfileContextTokenPayload {
  userId: string;
  refreshTokenId: string;
  mode: ProfileMode;
  learnerId: string | null;
  issuedAt: number;
  expiresAt: number;
}

export interface RequestLike {
  headers: {
    cookie?: string;
    authorization?: string;
  };
}
