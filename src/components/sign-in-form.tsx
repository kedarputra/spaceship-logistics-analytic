"use client";

import { type ComponentProps, type FormEvent, useRef, useState } from "react";
import { MAX_PASSWORD_LENGTH, MAX_USERNAME_LENGTH } from "@/auth/credentials";
import { Spinner } from "./spinner";

/**
 * The sign-in form (ticket 31): Username, Password and Sign in. It posts to /api/login and, signed in,
 * loads the page it was sent from, so the shell is drawn for the new role. A refusal says why under
 * the fields, rising in as new content does (ticket 30), and the password is cleared for the next try.
 * Signing in needs the script; a form sent before it loads still posts to /api/login, which refuses it,
 * so a password never ends up in the address.
 */

type Outcome = { next: string } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function postSignIn(payload: { username: string; password: string; next: string }): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    return { error: "The server could not be reached. Try again." };
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (response.ok && isRecord(body) && typeof body.next === "string") return { next: body.next };
  return { error: isRecord(body) && typeof body.error === "string" ? body.error : "Sign-in failed. Try again." };
}

function Field({ id, label, ...input }: { id: string; label: string } & ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-semibold text-ink-2">
        {label}
      </label>
      <input id={id} name={id} required className="field w-full" {...input} />
    </div>
  );
}

export function SignInForm({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  // Each refusal is a new alert, so the same words said twice are announced twice.
  const [refusal, setRefusal] = useState<{ message: string; count: number }>();
  const password = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    const outcome = await postSignIn({ username: String(fields.get("username") ?? ""), password: String(fields.get("password") ?? ""), next });
    if ("next" in outcome) {
      window.location.assign(outcome.next);
      return;
    }
    setBusy(false);
    setRefusal((previous) => ({ message: outcome.error, count: (previous?.count ?? 0) + 1 }));
    if (password.current !== null) {
      password.current.value = "";
      password.current.focus();
    }
  }

  return (
    <form method="post" action="/api/login" onSubmit={submit} className="flex flex-col gap-4">
      <Field id="username" label="Username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={MAX_USERNAME_LENGTH} />
      <Field id="password" label="Password" type="password" autoComplete="current-password" maxLength={MAX_PASSWORD_LENGTH} ref={password} />
      {refusal === undefined ? null : (
        <p key={refusal.count} role="alert" className="animate-arrive rounded-control border border-bad-line bg-bad-tint px-3.5 py-2.5 text-small text-bad-ink">
          {refusal.message}
        </p>
      )}
      <button type="submit" disabled={busy} className="button-primary relative mt-1 w-full">
        <span className={busy ? "opacity-0" : undefined}>Sign in</span>
        {busy ? <Spinner /> : null}
      </button>
    </form>
  );
}
