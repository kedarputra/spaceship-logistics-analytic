import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { authConfigured } from "@/auth/access";
import { safeNextPath } from "@/auth/next-path";
import { NOT_CONFIGURED } from "@/auth/sign-in";
import { SignInCard } from "@/components/sign-in-card";
import { SignInForm } from "@/components/sign-in-form";
import { currentUser } from "../auth";

export const metadata: Metadata = { title: "Sign in · Logistics Analytics" };

/**
 * `/login` (ticket 31): the product's name, Username, Password and Sign in. Without a usable secret or
 * users file it says sign-in isn't configured, and shows no form. Someone already signed in goes on to
 * `next`; to sign in as someone else, they sign out first.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next);
  if (!authConfigured()) {
    return (
      <SignInCard>
        <p role="status" className="rounded-control border border-warn-line bg-warn-tint px-3.5 py-2.5 text-small text-warn-ink">
          {NOT_CONFIGURED}
        </p>
      </SignInCard>
    );
  }
  if ((await currentUser()) !== undefined) redirect(target);
  return (
    <SignInCard>
      <SignInForm next={target} />
    </SignInCard>
  );
}
