import { Resend } from "resend";

/**
 * Expo Router Server-Side API Route: POST /api/send-email
 *
 * Implements the secure server-side email dispatch pattern demonstrated in:
 * "How to send emails with Resend from your Expo app" (https://www.youtube.com/watch?v=8sPD8SNcUFA)
 *
 * This keeps the Resend API secret key safely on the server side and avoids
 * leaking sensitive credentials into the client-side mobile/web bundles.
 */
export async function POST(request) {
  try {
    const apiKey =
      process.env.RESEND_API_KEY ||
      process.env.EXPO_PUBLIC_RESEND_API_KEY;

    if (!apiKey) {
      console.error("[send-email+api] RESEND_API_KEY is not defined in the environment.");
      return Response.json(
        {
          error:
            "RESEND_API_KEY is not configured on the server. Please set RESEND_API_KEY in your .env file or hosting environment.",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { to, subject, html, text, attachments } = body;

    if (!to || (Array.isArray(to) && to.length === 0)) {
      return Response.json(
        { error: "Recipient email ('to') is required." },
        { status: 400 }
      );
    }

    const recipientList = Array.isArray(to) ? to : [to];

    const fromAddress =
      process.env.REPORT_FROM_EMAIL ||
      process.env.EXPO_PUBLIC_REPORT_FROM_EMAIL ||
      "Expense Tracker <onboarding@resend.dev>";

    const resend = new Resend(apiKey);

    const emailPayload = {
      from: fromAddress,
      to: recipientList,
      subject: subject || "Monthly Expense Report",
      html: html || undefined,
      text: text || undefined,
      attachments: Array.isArray(attachments) ? attachments : undefined,
    };

    console.log(`[send-email+api] Dispatching email to: ${recipientList.join(", ")} | Subject: "${subject}"`);

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error("[send-email+api] Resend rejected email:", error);
      return Response.json(
        { error: error.message || error.name || "Failed to dispatch email via Resend" },
        { status: 400 }
      );
    }

    console.log(`[send-email+api] Email successfully accepted by Resend! ID: ${data?.id}`);
    return Response.json({
      success: true,
      data,
      id: data?.id,
    });
  } catch (err) {
    console.error("[send-email+api] Server exception:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

