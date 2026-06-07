"use client";

import { Banknote, BookOpenCheck, CreditCard, Download, FileCheck2, FilePlus2, Receipt, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE" | "RECEIVABLE" | "PAYABLE" | "TAX" | "CASH" | "BANK";
type LedgerEntry = {
  id: string;
  date: string;
  accountName: string;
  accountType: AccountType;
  description?: string;
  debit: string | number;
  credit: string | number;
  reference?: string;
};
type Expense = {
  id: string;
  date: string;
  category: string;
  vendor?: string;
  amount: string | number;
  gstRate: string | number;
  paymentMode: string;
  notes?: string;
};
type BankAccount = {
  id: string;
  name: string;
  type: "CASH" | "BANK";
  currentBalance: string | number;
  openingBalance: string | number;
};
type AccountingSummary = {
  receivables: string | number;
  payables: string | number;
  expenses: string | number;
  gstLiability: string | number;
  totalDebit: string | number;
  totalCredit: string | number;
  bankAccounts: BankAccount[];
  recentLedger: LedgerEntry[];
  recentExpenses: Expense[];
};

const accountTypes: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE", "RECEIVABLE", "PAYABLE", "TAX", "CASH", "BANK"];

function money(value: string | number | undefined) {
  return Number(value ?? 0);
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | number | undefined) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(ledger: LedgerEntry[], expenses: Expense[]) {
  const ledgerRows = [
    ["Ledger Date", "Account", "Type", "Description", "Debit", "Credit", "Reference"],
    ...ledger.map((entry) => [new Date(entry.date).toLocaleString("en-IN"), entry.accountName, entry.accountType, entry.description ?? "", money(entry.debit), money(entry.credit), entry.reference ?? ""])
  ];
  const expenseRows = [
    [],
    ["Expense Date", "Category", "Vendor", "Amount", "GST %", "Payment Mode", "Notes"],
    ...expenses.map((expense) => [new Date(expense.date).toLocaleString("en-IN"), expense.category, expense.vendor ?? "", money(expense.amount), money(expense.gstRate), expense.paymentMode, expense.notes ?? ""])
  ];
  const csv = [...ledgerRows, ...expenseRows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadText(`MM-SuperMart-Accounting-${Date.now()}.csv`, csv, "text/csv;charset=utf-8");
}

function exportPdf(summary: AccountingSummary | null, ledger: LedgerEntry[], expenses: Expense[]) {
  const lines = [
    "M&M SuperMart ERP & POS",
    "Accounting Report",
    `Generated: ${new Date().toLocaleString("en-IN")}`,
    "",
    `Receivables: ${formatCurrency(money(summary?.receivables))}`,
    `Payables: ${formatCurrency(money(summary?.payables))}`,
    `Expenses: ${formatCurrency(money(summary?.expenses))}`,
    `GST Liability: ${formatCurrency(money(summary?.gstLiability))}`,
    "",
    "Recent Ledger",
    ...ledger.map((entry) => `${new Date(entry.date).toLocaleDateString("en-IN")} | ${entry.accountName} | ${entry.accountType} | Dr ${money(entry.debit)} | Cr ${money(entry.credit)} | ${entry.reference ?? ""}`),
    "",
    "Recent Expenses",
    ...expenses.map((expense) => `${new Date(expense.date).toLocaleDateString("en-IN")} | ${expense.category} | ${expense.vendor ?? ""} | ${money(expense.amount)} | ${expense.paymentMode}`)
  ];
  const escaped = lines.map((line, index) => `${index ? "0 -14 Td " : ""}(${line.replace(/[^\x20-\x7E]/g, "").replace(/[\\()]/g, "\\$&").slice(0, 120)}) Tj`).join("\n");
  const content = `BT\n/F1 9 Tf\n36 806 Td\n${escaped}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  downloadText(`MM-SuperMart-Accounting-${Date.now()}.pdf`, pdf, "application/pdf");
}

export function AccountingModule() {
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading live accounting data...");
  const [expenseForm, setExpenseForm] = useState({ category: "", vendor: "", amount: "", gstRate: "18", paymentMode: "CASH", notes: "" });
  const [ledgerForm, setLedgerForm] = useState({ accountName: "", accountType: "REVENUE" as AccountType, debit: "", credit: "", reference: "", description: "" });

  async function loadAccounting() {
    setLoading(true);
    try {
      const [summaryData, ledgerData, expenseData] = await Promise.all([
        apiRequest<AccountingSummary>("/accounting/summary"),
        apiRequest<{ data: LedgerEntry[] }>("/accounting/ledger?take=50"),
        apiRequest<{ data: Expense[] }>("/accounting/expenses?take=50")
      ]);
      setSummary(summaryData);
      setLedger(ledgerData.data);
      setExpenses(expenseData.data);
      setMessage("Accounting data is live from the database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load accounting data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccounting();
  }, []);

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest("/accounting/expenses", {
        method: "POST",
        body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount), gstRate: Number(expenseForm.gstRate) })
      });
      setExpenseForm({ category: "", vendor: "", amount: "", gstRate: "18", paymentMode: "CASH", notes: "" });
      setMessage("Expense saved and ledger entry created.");
      await loadAccounting();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save expense.");
    }
  }

  async function saveLedgerEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest("/accounting/ledger", {
        method: "POST",
        body: JSON.stringify({ ...ledgerForm, debit: Number(ledgerForm.debit || 0), credit: Number(ledgerForm.credit || 0) })
      });
      setLedgerForm({ accountName: "", accountType: "REVENUE", debit: "", credit: "", reference: "", description: "" });
      setMessage("Ledger entry saved.");
      await loadAccounting();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save ledger entry.");
    }
  }

  const metrics = [
    { label: "Receivables", value: money(summary?.receivables), note: "Customer outstanding ledger", icon: Banknote },
    { label: "Payables", value: money(summary?.payables), note: "Supplier payable ledger", icon: Receipt },
    { label: "Expenses", value: money(summary?.expenses), note: "Recorded business expenses", icon: BookOpenCheck },
    { label: "GST Liability", value: money(summary?.gstLiability), note: "Output GST payable ledger", icon: FileCheck2 }
  ];

  const cashflowSeries = useMemo(() => {
    const buckets = new Map<string, { month: string; inflow: number; outflow: number }>();
    for (const entry of ledger) {
      const date = new Date(entry.date);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const month = date.toLocaleString("en-IN", { month: "short" });
      const current = buckets.get(key) ?? { month, inflow: 0, outflow: 0 };
      current.inflow += money(entry.credit);
      current.outflow += money(entry.debit);
      buckets.set(key, current);
    }
    return Array.from(buckets.values()).slice(0, 6).reverse();
  }, [ledger]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Accounting & Cashflow</h1>
          <p className="text-muted-foreground">Live books for receivables, payables, GST, expenses, ledger, bank, and cash tracking.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadAccounting} disabled={loading}><RefreshCw className="size-4" /> Refresh</Button>
          <Button variant="outline" onClick={() => exportCsv(ledger, expenses)}><Download className="size-4" /> CSV</Button>
          <Button onClick={() => exportPdf(summary, ledger, expenses)}><Download className="size-4" /> PDF</Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">{message}</div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">{item.label}</CardTitle>
                <Icon className="size-5 text-primary" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCurrency(item.value)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle>Cashflow Trend</CardTitle></CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `INR ${Number(value) / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="inflow" fill="#059669" radius={[6, 6, 0, 0]} />
                <Bar dataKey="outflow" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cash & Payment Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(summary?.bankAccounts ?? []).map((account, index) => (
              <div className="rounded-md border p-3" key={account.id}>
                <div className="flex items-center justify-between"><p className="text-sm font-medium">{account.type === "CASH" ? "Cash Balance" : `Payment Balance ${index + 1}`}</p><CreditCard className="size-4 text-primary" /></div>
                <p className="mt-1 text-xs text-muted-foreground">{account.type === "CASH" ? "Cash drawer" : "Digital/card settlement"}</p>
                <p className="mt-2 text-lg font-semibold">{formatCurrency(money(account.currentBalance))}</p>
              </div>
            ))}
            {!summary?.bankAccounts?.length ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No cash or payment accounts found.</div> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Record Expense</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={saveExpense}>
              <Input placeholder="Category e.g. Electricity" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} required />
              <Input placeholder="Vendor / paid to" value={expenseForm.vendor} onChange={(event) => setExpenseForm({ ...expenseForm, vendor: event.target.value })} />
              <Input placeholder="Amount" type="number" step="0.01" min="0" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} required />
              <Input placeholder="GST %" type="number" step="0.01" min="0" value={expenseForm.gstRate} onChange={(event) => setExpenseForm({ ...expenseForm, gstRate: event.target.value })} />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={expenseForm.paymentMode} onChange={(event) => setExpenseForm({ ...expenseForm, paymentMode: event.target.value })}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
              <Input placeholder="Notes" value={expenseForm.notes} onChange={(event) => setExpenseForm({ ...expenseForm, notes: event.target.value })} />
              <Button className="md:col-span-2" type="submit"><Save className="size-4" /> Save Expense</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Manual Ledger Entry</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={saveLedgerEntry}>
              <Input placeholder="Account name" value={ledgerForm.accountName} onChange={(event) => setLedgerForm({ ...ledgerForm, accountName: event.target.value })} required />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={ledgerForm.accountType} onChange={(event) => setLedgerForm({ ...ledgerForm, accountType: event.target.value as AccountType })}>
                {accountTypes.map((type) => <option value={type} key={type}>{type}</option>)}
              </select>
              <Input placeholder="Debit" type="number" step="0.01" min="0" value={ledgerForm.debit} onChange={(event) => setLedgerForm({ ...ledgerForm, debit: event.target.value })} />
              <Input placeholder="Credit" type="number" step="0.01" min="0" value={ledgerForm.credit} onChange={(event) => setLedgerForm({ ...ledgerForm, credit: event.target.value })} />
              <Input placeholder="Reference" value={ledgerForm.reference} onChange={(event) => setLedgerForm({ ...ledgerForm, reference: event.target.value })} />
              <Input placeholder="Description" value={ledgerForm.description} onChange={(event) => setLedgerForm({ ...ledgerForm, description: event.target.value })} />
              <Button className="md:col-span-2" type="submit"><FilePlus2 className="size-4" /> Save Ledger Entry</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Date</th><th>Account</th><th>Type</th><th>Description</th><th>Debit</th><th>Credit</th><th>Reference</th></tr></thead>
            <tbody>
              {ledger.map((entry) => (
                <tr className="border-t" key={entry.id}>
                  <td className="py-3">{new Date(entry.date).toLocaleString("en-IN")}</td>
                  <td className="font-medium">{entry.accountName}</td>
                  <td>{entry.accountType}</td>
                  <td>{entry.description ?? "-"}</td>
                  <td>{formatCurrency(money(entry.debit))}</td>
                  <td>{formatCurrency(money(entry.credit))}</td>
                  <td>{entry.reference ?? "-"}</td>
                </tr>
              ))}
              {!ledger.length ? <tr className="border-t"><td className="py-6 text-muted-foreground" colSpan={7}>No ledger entries yet.</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>GST</th><th>Mode</th><th>Notes</th></tr></thead>
            <tbody>
              {expenses.map((expense) => (
                <tr className="border-t" key={expense.id}>
                  <td className="py-3">{new Date(expense.date).toLocaleString("en-IN")}</td>
                  <td className="font-medium">{expense.category}</td>
                  <td>{expense.vendor ?? "-"}</td>
                  <td>{formatCurrency(money(expense.amount))}</td>
                  <td>{money(expense.gstRate)}%</td>
                  <td>{expense.paymentMode}</td>
                  <td>{expense.notes ?? "-"}</td>
                </tr>
              ))}
              {!expenses.length ? <tr className="border-t"><td className="py-6 text-muted-foreground" colSpan={7}>No expenses recorded.</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
