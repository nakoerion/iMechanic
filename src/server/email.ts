/**
 * Server-only email sender — the ONE place the app talks to Resend.
 *
 * Rules this module enforces (Slice S2):
 *  - If `RESEND_API_KEY` is set we send for real and THROW unless Resend
 *    accepts the message (2xx). We never claim a send succeeded that didn't.
 *  - If the key is absent in dev (non-production), we log the full magic-link
 *    URL labelled as a dev-only fallback and return `status: "dev-logged"` so
 *    the caller can tell a real send from a fallback.
 *  - If the key is absent in production, we THROW. A production experience
 *    must never fabricate a delivery: the user sees an honest error.
 *
 * Import this module ONLY from server code (`createServerFn` handlers, the
 * server build). It carries no client-safe side effects but the policy here
 * is the trust boundary for the whole magic-link flow.
 */
export type SendEmailResult =
  | { status: "sent" }
  | { status: "dev-logged" };

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (import.meta.env.PROD) {
      throw new Error(
        "RESEND_API_KEY is not set — refusing to pretend an email was sent in production.",
      );
    }
    // Dev-only fallback: log the URL so the flow is exercisable end to end
    // without a real email provider. This must never run in production.
    console.log(
      "[iMechanic][dev-only] Email would have been sent via Resend — " +
        "RESEND_API_KEY is not set. Full magic-link URL for testing:\n" +
        html,
    );
    return { status: "dev-logged" };
  }

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "iMechanic <login@imechanic.app>",
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    throw new Error(
      `Unable to reach the email service: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(
      `Email service rejected the message (HTTP ${res.status}${detail ? `: ${detail}` : ""})`,
    );
  }

  return { status: "sent" };
}