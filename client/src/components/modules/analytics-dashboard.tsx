"use client";

import { AlertTriangle, Barcode, Boxes, IndianRupee, ReceiptText, ShoppingCart, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingStore } from "@/lib/stores/billing-store";
import { useProductStore } from "@/lib/stores/product-store";
import { formatCurrency } from "@/lib/utils";

export function AnalyticsDashboard() {
  const { invoices } = useBillingStore();
  const { products } = useProductStore();
  const [showTopProducts, setShowTopProducts] = useState(false);
  const [revenueView, setRevenueView] = useState<"monthly" | "daily">("monthly");
  const icons = [IndianRupee, TrendingUp, ReceiptText, Boxes];
  const now = new Date();
  const todayInvoices = invoices.filter((invoice) => new Date(invoice.createdAt).toDateString() === now.toDateString());
  const monthInvoices = invoices.filter((invoice) => {
    const created = new Date(invoice.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  });
  const todayRevenue = todayInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const todayProfit = todayInvoices.reduce((sum, invoice) => sum + (invoice.profit ?? 0), 0);
  const totalProductsSold = todayInvoices.reduce((sum, invoice) => sum + invoice.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const customerSavings = todayInvoices.reduce((sum, invoice) => sum + (invoice.savings ?? invoice.discount ?? 0), 0);
  const dashboardMetrics = [
    { label: "Today's Revenue", value: formatCurrency(todayRevenue), delta: `${todayInvoices.length} bills generated today` },
    { label: "Today's Profit", value: formatCurrency(todayProfit), delta: "Selling price minus purchase price" },
    { label: "Total Bills", value: String(todayInvoices.length), delta: `${Math.round(totalProductsSold * 100) / 100} products sold today` },
    { label: "Customer Savings", value: formatCurrency(customerSavings), delta: "MRP minus selling price savings" }
  ];
  const revenueSeries = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    const revenue = invoices
      .filter((invoice) => {
        const created = new Date(invoice.createdAt);
        return created.getMonth() === date.getMonth() && created.getFullYear() === date.getFullYear();
      })
      .reduce((sum, invoice) => sum + invoice.total, 0);
    return { month: date.toLocaleString("en-IN", { month: "short" }), revenue };
  });
  const dailyRevenueCandles = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29 + index);
    const dayInvoices = invoices
      .filter((invoice) => new Date(invoice.createdAt).toDateString() === date.toDateString())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let running = 0;
    const values = dayInvoices.map((invoice) => {
      running += invoice.total;
      return running;
    });
    const open = dayInvoices[0]?.total ?? 0;
    const close = values.at(-1) ?? 0;
    return {
      label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      open,
      high: values.length ? Math.max(...values) : 0,
      low: values.length ? Math.min(open, ...values) : 0,
      close
    };
  });
  const productSalesMap = new Map<string, number>();
  for (const invoice of monthInvoices) {
    for (const item of invoice.items) {
      productSalesMap.set(item.name, (productSalesMap.get(item.name) ?? 0) + item.quantity);
    }
  }
  const topProductSales = Array.from(productSalesMap.entries())
    .map(([name, sales]) => ({ fullName: name, name: name.length > 16 ? `${name.slice(0, 15)}.` : name, sales }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 50);
  const visibleProductSales = showTopProducts ? topProductSales : topProductSales.slice(0, 10);
  const lowStock = products.filter((item) => item.stock > 0 && item.stock <= 5).slice(0, 6);
  const transactions = invoices.slice(0, 8).map((invoice, index) => ({
    key: `${invoice.invoiceNo}-${invoice.createdAt}-${index}`,
    invoice: invoice.invoiceNo,
    customer: invoice.customerName,
    mode: invoice.paymentMethod,
    total: invoice.total,
    status: "Paid"
  }));

  return (
    <motion.section className="space-y-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="rounded-lg border bg-slate-950 p-5 text-white shadow-soft md:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
          <p className="text-sm font-medium uppercase text-white/55">Daily control room</p>
          <h1 className="page-title mt-2 text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Track today&apos;s billing, profit, stock alerts, and recent transactions from one quiet screen.</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/8 px-4 py-3 text-sm">Today: <span className="font-semibold text-white">{todayInvoices.length} bills / {formatCurrency(todayRevenue)}</span></div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboardMetrics.map((metric, index) => {
          const Icon = icons[index];
          return (
            <Card key={metric.label} className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm text-muted-foreground">{metric.label}</CardTitle>
                <span className="grid size-9 place-items-center rounded-md bg-primary/10"><Icon className="size-5 text-primary" /></span>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{metric.value}</p>
                <p className="mt-1 text-xs text-emerald-600">{metric.delta}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Start Billing</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Link className="rounded-md border bg-card/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/55" href="/customers">
            <Users className="mb-3 size-5 text-primary" />
            <p className="text-sm font-medium">1. Select Customer</p>
            <p className="mt-1 text-xs text-muted-foreground">Open customer records before billing when credit or loyalty details matter.</p>
          </Link>
          <Link className="rounded-md border bg-card/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/55" href="/pos">
            <Barcode className="mb-3 size-5 text-primary" />
            <p className="text-sm font-medium">2. Scan In POS</p>
            <p className="mt-1 text-xs text-muted-foreground">Scan barcode or search by product name/SKU.</p>
          </Link>
          <Link className="rounded-md border bg-card/80 p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/55" href="/pos">
            <ShoppingCart className="mb-3 size-5 text-accent" />
            <p className="text-sm font-medium">3. Generate Bill</p>
            <p className="mt-1 text-xs text-muted-foreground">Create invoice, print receipt, and reduce stock.</p>
          </Link>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>{revenueView === "monthly" ? "Sales and Monthly Revenue" : "Daily Revenue Candles"}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant={revenueView === "monthly" ? "default" : "outline"} onClick={() => setRevenueView("monthly")}>Monthly</Button>
              <Button size="sm" variant={revenueView === "daily" ? "default" : "outline"} onClick={() => setRevenueView("daily")}>Daily</Button>
            </div>
          </CardHeader>
          <CardContent className="h-[320px]">
            {revenueView === "monthly" ? (
              <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="sales" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => `₹${Number(value) / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Area type="monotone" dataKey="revenue" stroke="#059669" fill="url(#sales)" strokeWidth={3} />
              </AreaChart>
              </ResponsiveContainer>
            ) : (
              <DailyCandleChart data={dailyRevenueCandles} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Best Selling Products</CardTitle>
              <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Top {visibleProductSales.length}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-[320px] overflow-x-auto">
              <BarChart width={Math.max(520, visibleProductSales.length * 48)} height={300} data={visibleProductSales}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" interval={0} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={76} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value} sold`, "Qty"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""} />
                <Bar dataKey="sales" radius={[6, 6, 0, 0]} fill="#f97316" />
              </BarChart>
            </div>
            {topProductSales.length > 10 ? (
              <Button className="w-full" variant="outline" onClick={() => setShowTopProducts((current) => !current)}>
                {showTopProducts ? "Show Less" : "More - Show Top 50 Products"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Low Stock Alerts</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {lowStock.map((item) => (
              <div className="flex items-center justify-between rounded-md border p-3" key={item.sku}>
                <div className="flex items-center gap-3"><AlertTriangle className="size-4 text-accent" /><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.sku}</p></div></div>
                <span className="text-sm font-semibold">{item.stock}</span>
              </div>
            ))}
            {lowStock.length === 0 ? <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No stock alerts yet. Add stock levels to begin tracking.</div> : null}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Invoice</th><th>Customer</th><th>Mode</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {transactions.map((row) => (
                  <tr className="border-t" key={row.key}><td className="py-3 font-medium">{row.invoice}</td><td>{row.customer}</td><td>{row.mode}</td><td>{formatCurrency(row.total)}</td><td><span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{row.status}</span></td></tr>
                ))}
                {transactions.length === 0 ? <tr className="border-t"><td className="py-6 text-muted-foreground" colSpan={5}>No transactions yet. Sales will appear here after billing starts.</td></tr> : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </motion.section>
  );
}

type DailyCandle = {
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

function DailyCandleChart({ data }: { data: DailyCandle[] }) {
  const width = Math.max(760, data.length * 28);
  const height = 300;
  const padding = { top: 18, right: 18, bottom: 48, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...data.map((item) => item.high));
  const minValue = Math.min(0, ...data.map((item) => item.low));
  const range = Math.max(1, maxValue - minValue);
  const step = chartWidth / Math.max(1, data.length);
  const candleWidth = Math.max(7, Math.min(16, step * 0.48));
  const y = (value: number) => padding.top + chartHeight - ((value - minValue) / range) * chartHeight;

  return (
    <div className="h-full overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="Daily revenue candle chart">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = minValue + range * tick;
          const yPos = y(value);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={yPos} y2={yPos} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <text x={padding.left - 8} y={yPos + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{formatCurrency(value)}</text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const centerX = padding.left + step * index + step / 2;
          const highY = y(item.high);
          const lowY = y(item.low);
          const openY = y(item.open);
          const closeY = y(item.close);
          const top = Math.min(openY, closeY);
          const bodyHeight = Math.max(3, Math.abs(closeY - openY));
          const positive = item.close >= item.open;
          return (
            <g key={item.label}>
              <line x1={centerX} x2={centerX} y1={highY} y2={lowY} stroke={positive ? "#059669" : "#dc2626"} strokeWidth={1.5} />
              <rect x={centerX - candleWidth / 2} y={top} width={candleWidth} height={bodyHeight} rx={2} fill={positive ? "#059669" : "#dc2626"} opacity={item.close || item.open ? 0.9 : 0.25} />
              {index % 3 === 0 ? <text x={centerX} y={height - 18} textAnchor="end" transform={`rotate(-35 ${centerX} ${height - 18})`} className="fill-muted-foreground text-[10px]">{item.label}</text> : null}
              <title>{`${item.label}: Open ${formatCurrency(item.open)}, High ${formatCurrency(item.high)}, Low ${formatCurrency(item.low)}, Close ${formatCurrency(item.close)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
