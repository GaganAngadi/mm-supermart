"use client";

import { Building2, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

type SupplierRecord = {
  id: string;
  accountNo: string;
  name: string;
  contactName: string;
  mobile: string;
  email: string;
  gstin: string;
  pan: string;
  openingPayable: string;
  creditLimit: string;
  creditDays: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

type ApiSupplier = {
  id: string;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gstin?: string | null;
  pendingPayment?: string | number | null;
};

const storageKey = "mm-supplier-accounts";

const emptySupplier: SupplierRecord = {
  id: "",
  accountNo: "10000077",
  name: "",
  contactName: "",
  mobile: "",
  email: "",
  gstin: "",
  pan: "",
  openingPayable: "",
  creditLimit: "",
  creditDays: "",
  address: "",
  city: "",
  state: "Karnataka",
  pincode: ""
};

function nextAccountNo(records: SupplierRecord[]) {
  const max = records.reduce((highest, record) => Math.max(highest, Number(record.accountNo) || 10000076), 10000076);
  return String(max + 1);
}

function mapApiSupplier(supplier: ApiSupplier, index: number): SupplierRecord {
  return {
    ...emptySupplier,
    id: supplier.id,
    accountNo: String(10000077 + index),
    name: supplier.name,
    contactName: supplier.contactName ?? "",
    mobile: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    gstin: supplier.gstin ?? "",
    openingPayable: supplier.pendingPayment ? String(supplier.pendingPayment) : ""
  };
}

export function SupplierAccountModule() {
  const [records, setRecords] = useState<SupplierRecord[]>([]);
  const [form, setForm] = useState<SupplierRecord>(emptySupplier);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const localRecords = JSON.parse(localStorage.getItem(storageKey) || "[]") as SupplierRecord[];
    setRecords(localRecords);
    setForm((current) => ({ ...current, accountNo: nextAccountNo(localRecords) }));

    void apiRequest<ApiSupplier[]>("/suppliers")
      .then((suppliers) => {
        if (localRecords.length) return;
        const mapped = suppliers.map(mapApiSupplier);
        setRecords(mapped);
        setForm((current) => ({ ...current, accountNo: nextAccountNo(mapped) }));
      })
      .catch(() => setMessage("Supplier API is unavailable. New suppliers will be saved locally."));
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(records));
  }, [records]);

  const filteredRecords = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return records;
    return records.filter((record) => [record.name, record.accountNo, record.mobile, record.gstin, record.city].some((value) => value.toLowerCase().includes(clean)));
  }, [query, records]);

  const payable = records.reduce((sum, record) => sum + (Number(record.openingPayable) || 0), 0);

  function update<K extends keyof SupplierRecord>(key: K, value: SupplierRecord[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function clearForm() {
    setForm({ ...emptySupplier, accountNo: nextAccountNo(records) });
    setMessage("");
  }

  async function saveSupplier() {
    if (!form.name.trim()) {
      setMessage("Supplier name is required.");
      return;
    }
    if (!form.accountNo.trim()) {
      setMessage("A/C Number is required.");
      return;
    }
    if (records.some((record) => record.accountNo === form.accountNo.trim() && record.id !== form.id)) {
      setMessage("This A/C Number is already used.");
      return;
    }

    setSaving(true);
    const record = { ...form, accountNo: form.accountNo.trim(), id: form.id || `supplier_${Date.now()}` };
    setRecords((current) => {
      const exists = current.some((item) => item.id === record.id);
      return exists ? current.map((item) => item.id === record.id ? record : item) : [record, ...current];
    });

    try {
      if (!record.id.startsWith("supplier_")) {
        await apiRequest<ApiSupplier>("/suppliers", {
          method: "POST",
          body: JSON.stringify({
            name: record.name.trim(),
            contactName: record.contactName || undefined,
            phone: record.mobile || undefined,
            email: record.email || undefined,
            address: [record.address, record.city, record.state, record.pincode].filter(Boolean).join(", ") || undefined,
            gstin: record.gstin || undefined
          })
        });
      }
      setMessage(`Saved ${record.name}.`);
      setForm({ ...emptySupplier, accountNo: nextAccountNo([record, ...records]) });
    } catch (error) {
      setMessage(error instanceof Error ? `Saved locally. Server message: ${error.message}` : "Saved locally.");
    } finally {
      setSaving(false);
    }
  }

  function editSupplier(record: SupplierRecord) {
    setForm(record);
    setMessage(`Editing ${record.name}.`);
  }

  function deleteSupplier(id: string) {
    setRecords((current) => current.filter((record) => record.id !== id));
    if (form.id === id) clearForm();
  }

  return (
    <section className="space-y-6">
      <div className="rounded-lg border bg-slate-950 p-5 text-white shadow-soft md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase text-white/55">Supplier master</p>
            <h1 className="page-title mt-2 text-3xl font-semibold">Supplier Account Creation</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/65">Add supplier account, tax details, opening payable, credit terms, and contact information.</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/8 px-4 py-3 text-sm">Next A/C: <span className="font-semibold">{form.accountNo}</span></div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(640px,1fr)_340px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" /> Account Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="grid gap-3 md:grid-cols-[160px_1fr]">
              <Field label="A/C Number"><Input value={form.accountNo} onChange={(event) => update("accountNo", event.target.value)} /></Field>
              <Field label="Supplier Name"><Input value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Contact Person"><Input value={form.contactName} onChange={(event) => update("contactName", event.target.value)} /></Field>
              <Field label="Mobile No."><Input inputMode="tel" value={form.mobile} onChange={(event) => update("mobile", event.target.value)} /></Field>
              <Field label="E-mail"><Input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></Field>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="GST No."><Input value={form.gstin} onChange={(event) => update("gstin", event.target.value.toUpperCase())} /></Field>
              <Field label="PAN No."><Input value={form.pan} onChange={(event) => update("pan", event.target.value.toUpperCase())} /></Field>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Opening Payable"><Input type="number" value={form.openingPayable} onChange={(event) => update("openingPayable", event.target.value)} /></Field>
              <Field label="Credit Limit"><Input type="number" value={form.creditLimit} onChange={(event) => update("creditLimit", event.target.value)} /></Field>
              <Field label="Credit Days"><Input type="number" value={form.creditDays} onChange={(event) => update("creditDays", event.target.value)} /></Field>
            </div>

            <div className="rounded-lg border bg-muted/25 p-4">
              <p className="mb-3 text-sm font-semibold text-primary">Address</p>
              <div className="grid gap-3">
                <Field label="Address"><textarea className="min-h-24 rounded-md border bg-card/90 px-3 py-2 text-sm outline-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring/30" value={form.address} onChange={(event) => update("address", event.target.value)} /></Field>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="City"><Input value={form.city} onChange={(event) => update("city", event.target.value)} /></Field>
                  <Field label="State"><Input value={form.state} onChange={(event) => update("state", event.target.value)} /></Field>
                  <Field label="Pincode"><Input inputMode="numeric" value={form.pincode} onChange={(event) => update("pincode", event.target.value)} /></Field>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">{message}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={saveSupplier} disabled={saving}><Save className="size-4" /> Save</Button>
                <Button variant="outline" onClick={clearForm}><Plus className="size-4" /> New</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="rounded-md bg-muted p-3"><p className="text-muted-foreground">Suppliers</p><p className="text-2xl font-semibold">{records.length}</p></div>
              <div className="rounded-md bg-muted p-3"><p className="text-muted-foreground">Opening Payable</p><p className="text-2xl font-semibold">{formatCurrency(payable)}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="gap-3">
              <CardTitle>Suppliers</CardTitle>
              <Input icon={Search} placeholder="Search supplier" value={query} onChange={(event) => setQuery(event.target.value)} />
            </CardHeader>
            <CardContent className="max-h-[560px] space-y-2 overflow-auto">
              {filteredRecords.map((record) => (
                <div className="rounded-md border bg-card/80 p-3" key={record.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{record.accountNo}</p>
                      <p className="font-semibold">{record.name}</p>
                      <p className="text-xs text-muted-foreground">{record.mobile || "No phone"} / {record.gstin || "No GST"}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => editSupplier(record)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteSupplier(record.id)}><Trash2 className="size-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
              {!filteredRecords.length ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No suppliers found.</div> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
