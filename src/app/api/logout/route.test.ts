import { describe, expect, it } from "vitest";
import { POST } from "./route";

function signOut(form: Record<string, string> = {}, origin = "https://wms.example"): Promise<Response> {
  return POST(
    new Request("http://wms.example/api/logout", {
      method: "POST",
      headers: { host: "wms.example", origin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    }),
  );
}

describe("POST /api/logout (ticket 31)", () => {
  it("clears the session cookie and returns to the sign-in page", async () => {
    const response = await signOut();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toBe("session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  });

  it("carries a page to come back to, for Sign in as someone else, only when it is on this site", async () => {
    expect((await signOut({ next: "/ask?q=x" })).headers.get("location")).toBe("/login?next=%2Fask%3Fq%3Dx");
    expect((await signOut({ next: "https://evil.example" })).headers.get("location")).toBe("/login");
  });

  it("refuses a request from another site, and leaves the cookie alone", async () => {
    const response = await signOut({}, "https://evil.example");
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
