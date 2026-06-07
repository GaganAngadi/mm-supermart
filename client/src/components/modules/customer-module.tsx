"use client";

import { Phone, ReceiptText, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBillingStore } from "@/lib/stores/billing-store";
import { formatCurrency } from "@/lib/utils";

export function CustomerModule() {
  const { invoices } = useBillingStore();
  const [search, setSearch] = useState("");
  const customers = useMemo(() => {
    const map = new Map<string, {
      customerId: string;
      name: string;
      mobile: string;
      purchases: number;
      total: number;
      savings: number;
      lastPurchase: string;
    }>();

    for (const invoice of invoices) {
      const key = invoice.customerMobile || invoice.customerId || invoice.customerName;
      const current = map.get(key) ?? {
        customerId: invoice.customerId || "CUST-0000",
        name: invoice.customerName || "Walk-in Customer",
        mobile: invoice.customerMobile || "",
        purchases: 0,
        total: 0,
        savings: 0,
        lastPurchase: invoice.createdAt
      };
      current.name = invoice.customerName || current.name;
      current.mobile = invoice.customerMobile || current.mobile;
      current.purchases += 1;
      current.total += invoice.total;
      current.savings += invoice.savings ?? 0;
      if (new Date(invoice.createdAt) > new Date(current.lastPurchase)) current.lastPurchase = invoice.createdAt;
      map.set(key, current);
    }

    const query = search.toLowerCase().trim();
    return Array.from(map.values())
      .filter((customer) => !query || [customer.customerId, customer.name, customer.mobile].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => new Date(b.lastPurchase).getTime() - new Date(a.lastPurchase).getTime());
  }, [invoices, search]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Customer Management</h1>
          <p className="text-muted-foreground">Customer history from POS bills using only the collected details: name, mobile number, bills, purchases, and savings.</p>
        </div>
        <Input className="md:w-96" icon={Search} placeholder="Search customer name or mobile" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Customer Records</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="py-2">Customer</th><th>Mobile</th><th>Bills</th><th>Total Purchase</th><th>Savings</th><th>Last Purchase</th></tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr className="border-t" key={customer.customerId + customer.mobile}>
                  <td className="py-3 font-medium"><div>{customer.name}</div><div className="text-xs text-muted-foreground">{customer.customerId}</div></td>
                  <td><span className="inline-flex items-center gap-1"><Phone className="size-3" /> {customer.mobile || "-"}</span></td>
                  <td><span className="inline-flex items-center gap-1"><ReceiptText className="size-3" /> {customer.purchases}</span></td>
                  <td>{formatCurrency(customer.total)}</td>
                  <td>{formatCurrency(customer.savings)}</td>
                  <td>{new Date(customer.lastPurchase).toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {!customers.length ? <tr className="border-t"><td className="py-8 text-muted-foreground" colSpan={6}>No customer records yet. Customer details will appear here after POS billing.</td></tr> : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
