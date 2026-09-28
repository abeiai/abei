import { ProfileSelector } from "@/components/profiles/profile-selector";
import { getCurrentUser } from "@/lib/auth-actions";
import { getProfileSelection } from "@/lib/profile-api";
import { profileContinuationPath } from "@/lib/profile-routing";

export default async function SelectProfilePage({
  searchParams
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = profileContinuationPath(next) ?? undefined;
  await getCurrentUser(safeNext);
  const selection = await getProfileSelection(safeNext);

  return (
    <main className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/45 px-5 py-8 backdrop-blur-sm">
      <section
        aria-labelledby="profile-selection-title"
        aria-modal="true"
        className="flex max-h-full w-full max-w-3xl flex-col gap-6 overflow-y-auto rounded-3xl border border-border bg-background p-6 shadow-2xl sm:p-8"
        role="dialog"
      >
        <header>
          <h1 className="text-2xl font-semibold tracking-normal" id="profile-selection-title">
            选择使用身份
          </h1>
        </header>
        <ProfileSelector
          autoSelectAccount={!selection.learners.some((learner) => learner.status === "ACTIVE")}
          next={safeNext}
          selection={selection}
        />
      </section>
    </main>
  );
}
