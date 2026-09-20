1.  Add Image Storage click or From gallery | Done | Check
2.  Backup in local .{any} file or related file type and Recovery
3.  Export/Import Excel | Done | Check
4.  Automated Backup in google drive (cron job or any related) | Almost Done | Check
5.  Sub Category | Done | Check
6.  Multi Account income/Expense Like Different Banks or Card like that etc and every account calculate properly aggregrate combine.
7.  Yearly / Monthly / day wise data graph | Done
8.  Automatically Export Monthly Expense report in mail |
    { No. SQLite exists only on the user’s phone, so a Supabase Cron job or Edge Function cannot access it while the app/device is closed.

You have two options:

Automatic monthly email

Sync SQLite expenses to MongoDB/Supabase.
Cloud cron reads synced records.
It generates and emails the PDF even when the app is closed.
SQLite-only email

The app generates and shares the PDF while it is open.
Android background scheduling is unreliable and may stop after app termination, reboot, battery optimization, or no internet.
iOS background execution is even more restricted.
Resend credentials also cannot be stored safely inside the mobile app.
Therefore, SQLite-only supports a user-triggered “Email Monthly Report” action, but not reliable fully automatic email. For automatic delivery, some cloud copy of the expense data is required.
}

## Automatic Monthly Expense PDF Email Plan

### 1. Required architecture

The mobile app stores data in SQLite and syncs it to MongoDB through the Node/Express API. A scheduled cloud function cannot read SQLite from the user's phone, so the report must use synced cloud data.

```text
Mobile SQLite
    -> syncAll()
Node/Express API
    -> MongoDB expenses
Supabase pg_cron (1st day of each month)
    -> Supabase Edge Function
    -> protected Node report endpoint
    -> generate PDF
    -> Resend email with PDF attachment
````

Recommended responsibility split:

- MongoDB: source of truth for report data
- Node API: protected report-data endpoint
- Supabase Cron: monthly scheduler
- Supabase Edge Function: PDF creation and email delivery
- Resend: transactional email provider

### 2. Important current-code gap

The current mobile sync only sends these fields:

```text
title, amount, month, method
```

For a complete PDF, update sync to also send:

```text
category, subcategory, date, description
```

Receipt images should not be embedded initially because `imageUri` is currently a local device URI. Upload receipts to cloud storage first if they must appear in scheduled reports.

For a single-user app, the recipient can be stored in `REPORT_TO_EMAIL`. For multiple users, every expense must include `userId`, and report preferences must be stored per user.

### 3. Required packages

No new mobile package is required for automatic emails.

The Edge Function can use `pdf-lib` from npm and the Resend HTTP API:

```typescript
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
```

Supabase CLI:

```bash
npx supabase login
npx supabase init
npx supabase link --project-ref YOUR_PROJECT_REF
```

### 4. Files to update or create

```text
Mobile/
  src/lib/sync/syncManager.js                         UPDATE

Gsap_Tutorial/Backend/
  Models/expense.js                                  UPDATE
  Routes/report.routes.js                            CREATE
  index.js or server.js                              UPDATE

Expense/
  supabase/
    functions/
      _shared/
        cors.ts                                      CREATE
      send-monthly-expense-report/
        index.ts                                     CREATE
```

### 5. Update the MongoDB expense model

Update `Gsap_Tutorial/Backend/Models/expense.js`:

```javascript
import mongoose from "mongoose";

const ExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, default: "Other" },
    subcategory: { type: String, default: null },
    method: { type: String, required: true },
    date: { type: String, default: "" },
    description: { type: String, default: "" },
    month: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

ExpenseSchema.index({ month: 1, createdAt: -1 });

const Expense = mongoose.model("Expense", ExpenseSchema);

export default Expense;
```

For a future multi-user version, use:

```javascript
userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
```

and replace the index with:

```javascript
ExpenseSchema.index({ userId: 1, month: 1, createdAt: -1 });
```

### 6. Update mobile-to-MongoDB sync

In both payload mappings inside `Mobile/src/lib/sync/syncManager.js`, send the complete report fields:

```javascript
const payload = pending.map(
  ({
    id,
    remoteId,
    title,
    amount,
    category,
    subcategory,
    date,
    description,
    month,
    method,
  }) => ({
    id,
    remoteId,
    title,
    amount,
    category,
    subcategory,
    date,
    description,
    month,
    method,
  }),
);
```

Update the `/expenses/sync` route assignment:

```javascript
{
  title: item.title,
  amount: Number(item.amount),
  category: item.category || "Other",
  subcategory: item.subcategory || null,
  date: item.date || "",
  description: item.description || "",
  month: item.month,
  method: item.method || "Cash",
}
```

Also include these fields in the delta query and local update so cloud and local data remain consistent:

```javascript
.select(
  "_id title amount category subcategory date description month method updatedAt",
)
```

### 7. Create a protected monthly report endpoint

Create `Gsap_Tutorial/Backend/Routes/report.routes.js`:

```javascript
import express from "express";
import Expense from "../Models/expense.js";

const router = express.Router();

router.get("/monthly", async (req, res) => {
  try {
    const suppliedSecret = req.get("x-report-secret");

    if (
      !process.env.REPORT_CRON_SECRET ||
      suppliedSecret !== process.env.REPORT_CRON_SECRET
    ) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { month } = req.query;

    if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
      return res.status(400).json({ error: "month must use yyyy-MM format" });
    }

    const expenses = await Expense.find({ month })
      .sort({ createdAt: 1 })
      .select("title amount category subcategory method date description month")
      .lean();

    const total = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    );

    return res.json({
      month,
      total,
      count: expenses.length,
      expenses,
    });
  } catch (error) {
    console.error("Monthly report data failed", error);
    return res.status(500).json({ error: "Unable to build monthly report" });
  }
});

export default router;
```

Register the route in the backend server entry file:

```javascript
import reportRoutes from "./Routes/report.routes.js";

app.use("/reports", reportRoutes);
```

Backend environment value:

```env
REPORT_CRON_SECRET=generate-a-long-random-secret
```

Never expose this value through an `EXPO_PUBLIC_` variable.

### 8. Create the Supabase Edge Function

Run:

```bash
npx supabase functions new send-monthly-expense-report
```

Create or replace `supabase/functions/send-monthly-expense-report/index.ts`:

```typescript
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

type Expense = {
  title: string;
  amount: number;
  category?: string;
  subcategory?: string | null;
  method?: string;
  date?: string;
  description?: string;
};

type ReportData = {
  month: string;
  total: number;
  count: number;
  expenses: Expense[];
};

function getPreviousMonth(now = new Date()) {
  const previous = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );

  return `${previous.getUTCFullYear()}-${String(
    previous.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

function formatMoney(value: number) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function safePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();
}

async function createReportPdf(report: ReportData) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const lineHeight = 18;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const drawText = (
    text: string,
    options: {
      size?: number;
      isBold?: boolean;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) => {
    if (y < margin + lineHeight) addPage();

    page.drawText(safePdfText(text).slice(0, 95), {
      x: margin,
      y,
      size: options.size || 10,
      font: options.isBold ? bold : regular,
      color: options.color || rgb(0.15, 0.18, 0.23),
    });
    y -= lineHeight;
  };

  drawText("Monthly Expense Report", {
    size: 22,
    isBold: true,
    color: rgb(0.15, 0.39, 0.92),
  });
  drawText(`Month: ${report.month}`, { size: 12, isBold: true });
  drawText(`Total: ${formatMoney(report.total)}`, { size: 12, isBold: true });
  drawText(`Records: ${report.count}`, { size: 12 });
  y -= 10;

  if (report.expenses.length === 0) {
    drawText("No expenses were recorded for this month.");
  }

  report.expenses.forEach((expense, index) => {
    const category = [expense.category, expense.subcategory]
      .filter(Boolean)
      .join(" / ");

    drawText(
      `${index + 1}. ${expense.title} - ${formatMoney(expense.amount)}`,
      { isBold: true },
    );
    drawText(
      `${expense.date || "No date"} | ${category || "Other"} | ${expense.method || "Cash"}`,
    );

    if (expense.description) {
      drawText(`Note: ${expense.description}`, {
        color: rgb(0.42, 0.45, 0.5),
      });
    }

    y -= 6;
  });

  return await pdf.saveAsBase64();
}

Deno.serve(async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const cronSecret = Deno.env.get("CRON_SECRET");
    if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
      return new Response("Unauthorized", { status: 401 });
    }

    const apiUrl = Deno.env.get("REPORT_API_URL");
    const apiSecret = Deno.env.get("REPORT_API_SECRET");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const reportTo = Deno.env.get("REPORT_TO_EMAIL");
    const reportFrom = Deno.env.get("RESEND_FROM_EMAIL");

    if (!apiUrl || !apiSecret || !resendKey || !reportTo || !reportFrom) {
      throw new Error("One or more required function secrets are missing");
    }

    const month = getPreviousMonth();
    const reportResponse = await fetch(
      `${apiUrl}/reports/monthly?month=${encodeURIComponent(month)}`,
      { headers: { "x-report-secret": apiSecret } },
    );

    if (!reportResponse.ok) {
      throw new Error(`Report API returned ${reportResponse.status}`);
    }

    const report = (await reportResponse.json()) as ReportData;
    const pdfBase64 = await createReportPdf(report);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `monthly-expense-${month}`,
      },
      body: JSON.stringify({
        from: reportFrom,
        to: [reportTo],
        subject: `Expense report for ${month}`,
        html: `
          <h2>Monthly expense report</h2>
          <p>Your report for <strong>${month}</strong> is attached.</p>
          <p>Total: <strong>${formatMoney(report.total)}</strong></p>
          <p>Records: ${report.count}</p>
        `,
        attachments: [
          {
            filename: `expense-report-${month}.pdf`,
            content: pdfBase64,
          },
        ],
      }),
    });

    if (!emailResponse.ok) {
      throw new Error(`Resend returned ${await emailResponse.text()}`);
    }

    const email = await emailResponse.json();

    return Response.json({
      success: true,
      month,
      records: report.count,
      emailId: email.id,
    });
  } catch (error) {
    console.error("Monthly report function failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
});
```

Note: standard PDF fonts do not contain the rupee symbol, so the first version uses `INR`. Embed a Unicode font later if the PDF must display `₹`.

### 9. Configure Resend

1. Create a Resend account.
2. Add and verify your sending domain.
3. Create an API key with sending permission.
4. Use a verified sender, for example:

```text
Expense Tracker <reports@yourdomain.com>
```

For early testing, Resend may restrict recipients until the domain is verified.

### 10. Store Edge Function secrets

Run from the Supabase project directory:

```bash
npx supabase secrets set REPORT_API_URL=https://your-api-domain.com
npx supabase secrets set REPORT_API_SECRET=the-same-value-as-backend-report-cron-secret
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
npx supabase secrets set REPORT_TO_EMAIL=your-email@example.com
npx supabase secrets set RESEND_FROM_EMAIL="Expense Tracker <reports@yourdomain.com>"
npx supabase secrets set CRON_SECRET=another-long-random-secret
```

Do not commit these values to Git or place them in mobile environment variables.

### 11. Deploy and test the Edge Function

Deploy without Supabase JWT verification because pg_cron uses the custom `x-cron-secret` header:

```bash
npx supabase functions deploy send-monthly-expense-report --no-verify-jwt
```

Test it manually:

```bash
curl -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-monthly-expense-report" \
  -H "x-cron-secret: YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response:

```json
{
  "success": true,
  "month": "2026-08",
  "records": 12,
  "emailId": "Resend email id"
}
```

### 12. Create the Supabase Cron job

Enable these extensions in Supabase Database > Extensions:

```text
pg_cron
pg_net
vault
```

Store the cron secret in Vault using the Supabase SQL editor:

```sql
select vault.create_secret(
  'YOUR_CRON_SECRET',
  'monthly_report_cron_secret',
  'Secret used to call the monthly report Edge Function'
);
```

Create the job. This runs at `03:30 UTC` on the first day of every month, which is `09:00 IST`:

```sql
select cron.schedule(
  'send-monthly-expense-report',
  '30 3 1 * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-monthly-expense-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'monthly_report_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Check registered jobs:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'send-monthly-expense-report';
```

Check recent runs:

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 20;
```

Remove or recreate the job:

```sql
select cron.unschedule('send-monthly-expense-report');
```

### 13. Prevent duplicate monthly emails

The Edge Function sends this Resend header:

```text
Idempotency-Key: monthly-expense-yyyy-MM
```

This protects against immediate retries. For stronger long-term protection, add a Supabase table:

```sql
create table public.monthly_report_deliveries (
  id bigint generated by default as identity primary key,
  report_month text not null unique,
  recipient text not null,
  resend_email_id text,
  status text not null check (status in ('processing', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
```

Before sending, insert the report month. If the unique constraint fails with an existing `sent` record, return success without sending again.

### 14. Reliability rules

- Run `syncAll()` whenever the app opens and after adding or editing an expense.
- The phone does not need to be online at cron time, but all expenses must have synced earlier.
- Keep report API and Edge Function secrets separate.
- Reject requests without valid secrets.
- Never put the MongoDB connection string or Resend key in the Expo app.
- Log the report month, record count, Resend email ID, and error message.
- Do not log API keys, secrets, or the full PDF body.
- Send an empty report when no expenses exist so the monthly automation remains observable.

### 15. Testing checklist

1. Add expenses for the previous month in the mobile app.
2. Confirm their `syncStatus` changes to `synced`.
3. Confirm MongoDB contains all report fields.
4. Call `/reports/monthly?month=yyyy-MM` with the correct secret.
5. Verify a wrong or missing secret returns HTTP 401.
6. Invoke the Edge Function manually.
7. Open the received PDF and verify title, total, count, and expense rows.
8. Invoke it twice and confirm duplicate protection works.
9. Verify the cron job is active.
10. Check Edge Function logs and `cron.job_run_details` after a scheduled run.

### 16. Implementation order

1. Expand MongoDB schema and mobile sync fields.
2. Deploy the protected Node report endpoint.
3. Configure and verify the Resend domain.
4. Create the Edge Function and secrets.
5. Test the Edge Function manually.
6. Add the Supabase cron job.
7. Add the delivery-log table and monitoring.

### 17. Multi-user upgrade

The code above is appropriate for the current single-recipient app. Before supporting multiple accounts:

- add authentication to the Node API
- store `userId` on every expense
- create a report preference record containing email, timezone, enabled state, and send time
- query expenses by both `userId` and `month`
- generate one PDF per user
- use an idempotency key containing both user ID and report month
- process users in small batches to avoid Edge Function timeout and Resend rate limits

Example idempotency key:

```text
monthly-expense-{userId}-{yyyy-MM}
```

=========================================================================================


=======================================================

# New Suggestions

### Summary Matrix

| Feature Category   | High-Impact Feature                       | Technical Feasibility | Stack Requirements              |
| :----------------- | :---------------------------------------- | :-------------------- | :------------------------------ |
| **Automation**     | Clipboard / SMS Smart Ingestion           | High                  | Regex / Clipboard API           |
| **Automation**     | Receipt OCR Text Extraction               | Medium                | ML Kit / Vision API             |
| **UX / Speed**     | Home Screen Quick Actions                 | High                  | `expo-quick-actions`            |
| **Budgeting**      | Dynamic "Daily Safe-to-Spend"             | High                  | SQLite query / state logic      |
| **Budgeting**      | Category Budgets & Push Thresholds        | High                  | `expo-notifications` + SQLite   |
| **Budgeting**      | 50/30/20 Rule Financial Health Analyzer   | High                  | Categorization tag + Analytics  |
| **Subscriptions**  | Recurring Bills & EMI Due Manager         | High                  | Local cron / notifications      |
| **Vehicle / Fuel** | Mileage (KM/L) & Cost-Per-KM Analytics    | High                  | Computed on existing `fuelLogs` |
| **Vehicle / Fuel** | Vehicle Service & PUC/Insurance Alerts    | High                  | `expo-notifications`            |
| **Security**       | Biometric App Lock (Face ID/Fingerprint)  | High                  | `expo-local-authentication`     |
| **Privacy**        | Public Stealth Mode (Hide Balance)        | High                  | Zustand / React Context         |
| **Peer / Travel**  | Borrow & Lend Tracker (Udhar / Khatabook) | High                  | Dedicated SQLite table          |
| **Peer / Travel**  | Trip Mode (#Tag Isolated Budgets)         | High                  | Tag column / filter view        |
| **Savings**        | Target Savings Jars & Sinking Funds       | High                  | Dedicated SQLite table          |
| **Tax & Search**   | Multi-Predicate Search & Tax Tagging      | High                  | SQL parameterized filters       |

---

## 1. Frictionless Data Ingestion & Automation

### 1.1 Clipboard Smart Parser (Bank / UPI SMS Ingestion)

- **Problem:** Manual expense entry has the highest user drop-off rate. Users frequently receive bank confirmation SMS or copy UPI payment strings.
- **Solution:** Add a "Smart Paste" button on the Add Expense modal (or auto-prompt when opening app with copied transaction text). A client-side regex engine parses:
  - **Amount:** Extracts `(?:Rs\.?|INR|\₹)\s*([\d,]+(?:\.\d{1,2})?)`
  - **Merchant / Title:** Matches phrases like `at [A-Z0-9\s]+`, `spent on [A-Z\s]+`, `paid to [A-Z\s]+`
  - **Payment Method:** Detects keywords `UPI`, `Credit Card`, `Debit Card`, `A/C ending XX1234`
  - **Date / Time:** Extracts transaction timestamp or defaults to current.
- **Tech Stack:** Pure JavaScript parsing + `@react-native-clipboard/clipboard`. Zero backend needed; completely private.

### 1.2 Receipt OCR & Field Auto-Extraction

- **Problem:** While image storage (`imageUri`) is supported, users still manually type the amount, date, and vendor name.
- **Solution:** Once an image is captured via `expo-image-picker` or camera, run optical character recognition to automatically extract:
  - Total amount (scans lines for `Total`, `Amount`, `Net`, followed by currency).
  - Receipt date.
  - Store/Merchant name from top header lines.
- **Tech Stack:** `@react-native-ml-kit/text-recognition` (on-device offline processing) or a lightweight serverless vision API.

### 1.3 Quick Actions / Home Screen App Shortcuts

- **Problem:** Opening the app, waiting for splash, and navigating to forms introduces friction for quick logs (e.g. buying a coffee).
- **Solution:** Add long-press app icon shortcuts on iOS/Android home screens:
  - `⚡ Add Expense`
  - `⛽ Quick Fuel Log`
  - `💰 Add Income`
- **Tech Stack:** `expo-quick-actions` with deep links (`expo-router` routing to modal screens).

---

## 2. Financial Discipline & Smart Budgeting

### 2.1 Dynamic "Daily Safe-to-Spend" Allowance

- **Problem:** A static monthly budget (e.g., ₹30,000) does not guide day-to-day spending. Users often overspend in the first two weeks and struggle at month end.
- **Solution:** Display a prominent dynamic metric on the home dashboard:
  $$\text{Daily Safe-to-Spend} = \frac{\text{Remaining Monthly Budget} - \text{Remaining Fixed Bills}}{\text{Days Left in Current Month}}$$
  - If the user spends ₹0 today, tomorrow's safe limit dynamically rises.
  - If they overspend today, the daily budget adjusts downwards to keep them strictly within monthly bounds.

### 2.2 Category-Specific Budgets & Threshold Notifications

- **Problem:** Flat monthly budgets don't tell the user _where_ money is being leaked (e.g. Dining vs. Grocery).
- **Solution:**
  - Set limits per category (e.g., _Dining: ₹6,000/mo_, _Shopping: ₹4,000/mo_).
  - Background/local trigger on expense creation:
    - At 80% category limit: Send warning notification (_"You've used 80% of your Dining budget this month"_).
    - At 100% category limit: Send critical alert (_"Dining budget exceeded by ₹450"_).
- **Tech Stack:** `expo-notifications` (scheduled local notifications, no server required).

### 2.3 50/30/20 Rule Financial Health Analyzer

- **Problem:** Users have raw expense figures but lack understanding of whether their lifestyle allocation is financially healthy.
- **Solution:** Tag categories into three buckets:
  - **Needs (50%):** Groceries, Rent, Utilities, Fuel, Health, EMIs.
  - **Wants (30%):** Dining out, Entertainment, Shopping, Hobbies.
  - **Savings & Debt (20%):** Investments, Sinking funds, Extra debt payoff.
- Display a dedicated visual compliance gauge in `Analytics.jsx` comparing actual vs. target distribution.

---

## 3. Recurring Bills & Subscription Lifecycle Tracker

### 3.1 Subscription & EMI Due Date Manager

- **Problem:** Unused recurring subscriptions (Netflix, Spotify, Cloud Storage, Gym) and forgotten EMI due dates silently drain wealth.
- **Solution:**
  - Create a `subscriptions` table tracking: `name`, `amount`, `billing_cycle` (monthly/yearly), `due_day`, `category`, `payment_method`, `is_active`.
  - **Upcoming Due List:** Cards highlighting upcoming bills in the next 7 days.
  - **Monthly Burn Rate Card:** Displays the guaranteed fixed overhead committed every month before discretionary spending begins.
  - **Local Reminder Notifications:** Alerts 2 days prior and on the morning of payment with 1-tap `[Mark as Paid]` action (which automatically logs the entry into `expenses`).

---

## 4. Vehicle & Fuel Lifecycle Expansion (Unique Differentiator)

> Note: The app already contains a rich `fuelLogs` schema (`startKm`, `odometerKm`, `litres`, `pricePerLitre`, `totalCost`).

### 4.1 Live Mileage & Vehicle Operating Cost Analytics

- **Features:**
  - **Calculated Mileage:** $\text{KM/L} = \frac{\text{Odometer KM} - \text{Start KM}}{\text{Litres}}$
  - **Cost per KM:** $\text{Cost/KM} = \frac{\text{Total Cost}}{\text{Distance Covered}}$
  - **Efficiency Trend Chart:** A line graph in `Fuel.jsx` showing mileage trends over time. Sudden drops in KM/L signal tire pressure or engine maintenance issues.

### 4.2 Maintenance, Insurance & PUC Expiry Reminders

- **Features:**
  - Service reminder based on odometer mileage (e.g., alert every 5,000 km or 6 months).
  - Insurance policy expiry date reminder.
  - PUC / Emission certificate renewal alert.
  - Log maintenance costs (Engine oil, brake pads, tires) linked to vehicle expenses.

---

## 5. Security & Privacy

### 5.1 Biometric Authentication (Face ID / Fingerprint / PIN Lock)

- **Problem:** Financial data is personal and sensitive. Friends, family, or colleagues holding the phone could browse financial balances.
- **Solution:**
  - Enable Face ID / Fingerprint or Fallback PIN upon opening app or resuming from background (after 1-minute idle timeout).
- **Tech Stack:** `expo-local-authentication` + `expo-secure-store`.

### 5.2 Stealth / Privacy Mode (Public Shield)

- **Problem:** Reviewing expenses or checking remaining budget in public transit or at the office exposes sensitive net worth and transaction numbers.
- **Solution:**
  - Eye icon toggle (`👁️`) on the dashboard header.
  - One tap converts all balances and amounts across all screens to `₹ ••••••`.
  - Persisted in local app preferences.

---

## 6. Peer Debts, Loans & Split (Udhar / Khatabook Lite)

### 6.1 Borrow & Lend Ledger ("Who Owes Who")

- **Problem:** Money lent to friends, shared dinner bills, or borrowed amounts are not normal expenses; treating them as expenses corrupts monthly budget numbers.
- **Solution:**
  - Table `peer_debts`: `person_name`, `amount`, `type` ('lent' | 'borrowed'), `due_date`, `status` ('pending' | 'settled'), `note`.
  - Track net balance: _"You are owed ₹4,200"_ / _"You owe ₹1,500"_.
  - **WhatsApp Share Reminder:** 1-tap button generating a pre-filled friendly message: _"Hey Rahul, just a friendly reminder regarding ₹1,200 for Dinner on Friday."_

### 6.2 Trip / Event Budget Mode (#Tags)

- **Problem:** A vacation or wedding trip temporarily spikes spending, corrupting normal monthly analytics and budget historical comparisons.
- **Solution:**
  - Tag expenses with an event or trip tag (e.g. `#GoaTrip2026`, `#HomeRenovation`).
  - Isolated trip view showing total cost, category breakdown for the trip, and optional dedicated trip budget, without skewing regular domestic monthly budgets.

---

## 7. Savings Goals & Sinking Funds

### 7.1 Target-Based Savings Jars

- **Problem:** Users struggle to save without visual milestones.
- **Solution:**
  - Table `savings_goals`: `title` (e.g. "Emergency Fund", "New Laptop", "Europe Trip"), `target_amount`, `current_saved`, `deadline`.
  - Progress bar showing percentage achieved.
  - **Smart Projection:** Calculates required monthly allocation:
    $$\text{Required Monthly Saving} = \frac{\text{Target Amount} - \text{Current Saved}}{\text{Months Remaining to Deadline}}$$
  - 1-tap "Deposit from Monthly Savings" button.

---

## 8. Search, Tax & Organization

### 8.1 Multi-Predicate Full-Text Search & Filtering

- **Features:**
  - Fast search by title, note, or merchant name.
  - Filter chips: `Date Range`, `Price Range` (e.g., > ₹1,000), `Payment Method`, `Has Receipt Image`, `Category`.
  - Sort by: Date (Newest/Oldest), Amount (Highest/Lowest).

### 8.2 Tax Deductible / Business Expense Tracker

- **Features:**
  - Toggle during expense creation: `[x] Tax Deductible / Business Expense`.
  - Tax category tag (e.g. Health Insurance, Donations, Equipment, Medical Bills).
  - Annual Tax Summary export for easy income tax filing.
