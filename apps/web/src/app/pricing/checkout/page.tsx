import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PricingCheckoutRedirectPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; order?: string; package?: string; paid?: string }>;
}) {
  const params = await searchParams;
  const target = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      target.set(key, value);
    }
  });

  const query = target.toString();

  redirect(query ? `/pricing?${query}` : "/pricing");
}
