import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { transformSync } from "@babel/core";
import React from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

const src = fileURLToPath(new URL("../../", import.meta.url));
const period = { monthKey: "2026-11", monthName: "November", year: 2026 };
const nativePdfBase64 = Buffer.from("%PDF-1.3\nnative-print-output").toString("base64");
const fixture = () => ({
  expenses: [
    { title: "MealNovember", amount: 125, month: "2026-11", method: "Cash" },
    { title: "MealOctober", amount: 500, month: "2026-10" },
  ],
  fuelLogs: [{ date: "03/11/2026", startKm: 100, litres: 2, pricePerLitre: 20, totalCost: 40, month: "2026-11" }],
  income: [
    { title: "SalaryNovember", amount: 2500, source: "Salary", accountId: 2, date: "02/11/2026", month: "2026-11" },
    { title: "IncomeBonus", amount: 50, source: "Other", accountId: null, month: "2026-11" },
    { title: "SalaryOctober", amount: 700, source: "Salary", accountId: 2, month: "2026-10" },
  ],
  accounts: [
    { id: 1, name: "Cash <Wallet>", type: "Cash", initialBalance: 100, earned: 500, spent: 80, balance: 470 },
    { id: 2, name: "BankSavings", type: "Bank", initialBalance: 1000, earned: 3200, spent: 545, balance: 3705 },
    { id: 3, name: "Overdraft", type: "Bank", initialBalance: 0, earned: 0, spent: 10, balance: -10 },
  ],
});

// Load production ES modules and JSX, replacing only device/network boundaries.
// The component's handlers, report loader, PDF content and XLSX encoder all run.
function harness(os = "android", data = fixture()) {
  const captured = { prints: [], saves: [], drafts: [], requests: [], reads: [], deleted: [], downloads: [], links: [] };
  const slots = [];
  let hookIndex = 0;
  const react = {
    ...React,
    useState(initial) {
      const index = hookIndex++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect() {},
  };
  class DownloadPDF extends jsPDF {
    constructor(...args) {
      super(...args);
      this.save = async (fileName) => {
        captured.downloads.push({ fileName, pdf: this.output(), pages: this.getNumberOfPages() });
      };
    }
  }
  const mocks = new Map(Object.entries({
    react: { ...react, default: react },
    "react-native": {
      ...Object.fromEntries(["ActivityIndicator", "KeyboardAvoidingView", "Modal", "Text", "TextInput", "TouchableOpacity", "View"].map((name) => [name, name])),
      Platform: { OS: os },
      Alert: { alert: (...args) => { throw new Error(`Unexpected alert: ${args.join(" ")}`); } },
      Linking: { openURL: async (url) => { captured.links.push(url); } },
    },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "expo-constants": { default: {} },
    "expo-print": {
      printToFileAsync: async ({ html }) => {
        captured.prints.push(html);
        return { uri: "file:///test-report.pdf" };
      },
    },
    "expo-file-system/legacy": {
      EncodingType: { Base64: "base64" },
      readAsStringAsync: async (uri) => { captured.reads.push(uri); return nativePdfBase64; },
      deleteAsync: async (uri) => { captured.deleted.push(uri); },
    },
    "expo-mail-composer": {
      isAvailableAsync: async () => true,
      composeAsync: async (options) => { captured.drafts.push(options); },
    },
    jspdf: { jsPDF: DownloadPDF },
    xlsx: XLSX,
    [path.join(src, "lib", "db", "queries.js")]: {
      getExpensesByMonth: async (month) => data.expenses.filter((item) => item.month === month),
      getFuelLogsByMonth: async (month) => data.fuelLogs.filter((item) => item.month === month),
      getAllIncome: async () => data.income,
      getAccountsWithBalances: async () => data.accounts,
    },
    [path.join(src, "lib", "utils", "publicStorage.js")]: {
      MIME_TYPES: { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      saveExportFile: async (options) => { captured.saves.push(options); return { ...options, location: "Test" }; },
    },
    [path.join(src, "lib", "utils", "storage.js")]: {
      getItem: async () => null,
      setItem: async () => {},
    },
  }));
  const context = vm.createContext({
    console, process: { env: {} }, __DEV__: true,
    fetch: async (url, options) => {
      captured.requests.push({ url, payload: JSON.parse(options.body) });
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ success: true, id: "test-email" }) };
    },
  });
  const modules = new Map();
  function resolve(specifier, parent) {
    let id = specifier;
    if (specifier.startsWith(".")) {
      id = path.resolve(path.dirname(parent.identifier), specifier);
      if (!existsSync(id)) id += existsSync(`${id}.js`) ? ".js" : ".jsx";
    }
    return moduleFor(id);
  }
  function moduleFor(id) {
    if (modules.has(id)) return modules.get(id);
    let module;
    if (mocks.has(id)) {
      const values = mocks.get(id);
      module = new vm.SyntheticModule(Object.keys(values), function () {
        for (const [key, value] of Object.entries(values)) this.setExport(key, value);
      }, { context, identifier: id });
    } else {
      assert.ok(id.startsWith(src), `Unexpected dependency: ${id}`);
      let code = readFileSync(id, "utf8");
      if (id.endsWith(".jsx")) {
        code = transformSync(code, {
          filename: id, babelrc: false, configFile: false,
          plugins: ["@babel/plugin-transform-react-jsx"],
        }).code;
      }
      module = new vm.SourceTextModule(code, {
        context, identifier: id,
        importModuleDynamically: async (specifier, parent) => {
          const dependency = resolve(specifier, parent);
          if (dependency.status === "unlinked") await dependency.link(resolve);
          if (dependency.status === "linked") await dependency.evaluate();
          return dependency;
        },
      });
    }
    modules.set(id, module);
    return module;
  }
  return {
    captured,
    async load(...parts) {
      const module = moduleFor(path.join(src, ...parts));
      if (module.status === "unlinked") await module.link(resolve);
      if (module.status === "linked") await module.evaluate();
      return module.namespace;
    },
    render(Component) { hookIndex = 0; return Component(period); },
  };
}

async function reportFor(app) {
  const { getMonthlyReportData } = await app.load("lib", "reports", "monthlyReportData.js");
  return getMonthlyReportData(period);
}

function elements(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

function text(node) {
  if (Array.isArray(node)) return node.map(text).join("");
  return node?.props ? text(node.props.children) : String(node ?? "");
}

async function pressEmailAction(app, label) {
  const { default: Button } = await app.load("components", "EmailReportButton.jsx");
  let tree = app.render(Button);
  elements(tree).find((node) => node.props?.accessibilityLabel === "Email report for November 2026").props.onPress();
  tree = app.render(Button);
  elements(tree).find((node) => node.type === "TextInput").props.onChangeText("report@example.com");
  tree = app.render(Button);
  const action = elements(tree).find((node) => node.type === "TouchableOpacity" && text(node).includes(label));
  assert.ok(action, `Missing email action: ${label}`);
  await action.props.onPress();
}

function assertNativeReport(html) {
  for (const value of ["<h2>Income</h2>", "<h2>Accounts</h2>", "SalaryNovember", "IncomeBonus", "BankSavings", "Cash &lt;Wallet&gt;", "Unassigned", "2500.00", "3200.00", "3705.00", "-10.00", "2385.00"]) {
    assert.ok(html.includes(value), `Missing PDF content: ${value}`);
  }
  assert.ok(!html.includes("SalaryOctober"));
  assert.match(html, /Balances are all-time/);
}

test("monthly report includes selected income and all-time account balances", async () => {
  const app = harness();
  const report = await reportFor(app);
  assert.equal(report.expenses.length, 1);
  assert.equal(report.income.length, 2);
  assert.equal(report.totalSpent, 125);
  assert.equal(report.fuelTotal, 40);
  assert.equal(report.incomeTotal, 2550);
  assert.equal(report.combinedTotal, 165);
  assert.equal(report.netSavings, 2385);
  assert.equal(report.totalBalance, 4165);
  assert.equal(report.accounts[1].earned, 3200);
});

test("income-only and accounts-only reports are exportable; empty reports are not", async () => {
  for (const kind of ["income", "accounts", "empty"]) {
    const data = { expenses: [], fuelLogs: [], income: [], accounts: [] };
    if (kind !== "empty") data[kind] = fixture()[kind];
    const app = harness("android", data);
    const { hasReportData } = await app.load("lib", "reports", "monthlyReportData.js");
    const report = await reportFor(app);
    assert.equal(hasReportData(report), kind !== "empty");
    if (kind !== "empty") {
      await pressEmailAction(app, "Open in Mail App");
      assert.equal(app.captured.drafts.length, 1, kind);
    }
  }
});

test("PDF export preserves spending and adds income, accounts and negative balances", async () => {
  const app = harness();
  const report = await reportFor(app);
  const { exportToPDF } = await app.load("lib", "utils", "pdfExporter.js");
  await exportToPDF(report);
  assertNativeReport(app.captured.prints[0]);
  assert.match(app.captured.prints[0], /MealNovember/);
  assert.match(app.captured.prints[0], /Fuel Fill-up History/);
  assert.equal(app.captured.saves[0].fileName, "Expense_Report_November_2026.pdf");
  assert.equal(app.captured.saves[0].base64, nativePdfBase64);
  assert.deepEqual(app.captured.deleted, ["file:///test-report.pdf"]);
});

test("Excel exports real Income and Accounts sheets while retaining Expenses first", async () => {
  const app = harness();
  const { exportExpensesToExcel } = await app.load("lib", "excel", "exportExcel.js");
  await exportExpensesToExcel(await reportFor(app));
  const workbook = XLSX.read(app.captured.saves[0].base64, { type: "base64" });
  assert.deepEqual(workbook.SheetNames, ["Expenses", "Income", "Accounts"]);
  const rows = (name) => XLSX.utils.sheet_to_json(workbook.Sheets[name]);
  assert.equal(rows("Expenses")[0].title, "MealNovember");
  assert.deepEqual(rows("Income").map((row) => row.account), ["BankSavings", "Unassigned"]);
  assert.equal(rows("Income")[0].amount, 2500);
  assert.equal(rows("Accounts")[1].openingBalance, 1000);
  assert.equal(rows("Accounts")[1].income, 3200);
  assert.equal(rows("Accounts")[1].spent, 545);
  assert.equal(rows("Accounts")[1].balance, 3705);
  assert.equal(rows("Accounts")[2].balance, -10);
});

test("Excel retains empty sheet headers for income-only and accounts-only reports", async () => {
  for (const kind of ["income", "accounts"]) {
    const app = harness("android", { expenses: [], fuelLogs: [], income: [], accounts: [], [kind]: fixture()[kind] });
    const { exportExpensesToExcel } = await app.load("lib", "excel", "exportExcel.js");
    await exportExpensesToExcel(await reportFor(app));
    const workbook = XLSX.read(app.captured.saves[0].base64, { type: "base64" });
    assert.deepEqual(workbook.SheetNames, ["Expenses", "Income", "Accounts"]);
    assert.equal(workbook.Sheets.Income.A1.v, "title");
    assert.equal(workbook.Sheets.Accounts.A1.v, "name");
  }
});

for (const os of ["android", "ios"]) {
  test(`${os} Mail App button passes income and accounts into the attached PDF`, async () => {
    const app = harness(os);
    await pressEmailAction(app, "Open in Mail App");
    assertNativeReport(app.captured.prints[0]);
    const draft = app.captured.drafts[0];
    assert.equal(draft.attachments[0], "file:///test-report.pdf");
    assert.equal(draft.recipients[0], "report@example.com");
    assert.match(draft.body, /Income: INR 2550.00/);
    assert.match(draft.body, /Account balances \(all-time\): INR 4165.00/);
  });

  test(`${os} Resend button attaches the full PDF and includes income/accounts in email HTML`, async () => {
    const app = harness(os);
    await pressEmailAction(app, "Send Directly via Resend");
    assertNativeReport(app.captured.prints[0]);
    assert.deepEqual(app.captured.reads, ["file:///test-report.pdf"]);
    const { payload } = app.captured.requests[0];
    assert.equal(payload.attachments[0].content, nativePdfBase64);
    assert.equal(payload.attachments[0].filename, "Expense_Report_November_2026.pdf");
    assert.match(payload.html, /Income/);
    assert.match(payload.html, /2,550.00/);
    assert.match(payload.html, /BankSavings/);
    assert.match(payload.html, /3,705.00/);
  });
}

test("web draft downloads a multi-page PDF with income/account details, not just totals", async () => {
  const data = fixture();
  data.income.push(...Array.from({ length: 60 }, (_, index) => ({
    title: `IncomeRow${index}`, amount: 1, month: period.monthKey, accountId: 1,
  })));
  const app = harness("web", data);
  await pressEmailAction(app, "Download PDF & Open Draft");
  const download = app.captured.downloads[0];
  assert.equal(download.fileName, "Expense_Report_November_2026.pdf");
  assert.ok(download.pages > 1);
  for (const value of ["SalaryNovember", "IncomeRow59", "BankSavings", "3705.00", "3200.00", "-10.00", "Unassigned"]) {
    assert.ok(download.pdf.includes(value), `Missing browser PDF content: ${value}`);
  }
  assert.ok(!download.pdf.includes("SalaryOctober"));
  assert.match(app.captured.links[0], /^mailto:report%40example.com/);
});

test("web PDF can be sent as a full Resend attachment without losing income or accounts", async () => {
  const app = harness("web");
  const report = await reportFor(app);
  const { createWebReportPDF } = await app.load("lib", "utils", "downloadEmailReport.js");
  const { sendReportViaResend } = await app.load("lib", "email", "resendReportService.js");
  await sendReportViaResend({
    recipient: "report@example.com", ...period, reportData: report,
    pdfResult: await createWebReportPDF(report),
  });
  const pdf = Buffer.from(app.captured.requests[0].payload.attachments[0].content, "base64").toString("latin1");
  assert.ok(pdf.startsWith("%PDF-"));
  assert.match(pdf, /SalaryNovember/);
  assert.match(pdf, /BankSavings/);
  assert.match(pdf, /3705.00/);
  assert.match(pdf, /Opening:/);
});
