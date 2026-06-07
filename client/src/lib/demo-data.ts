export const dashboardMetrics = [
  { label: "Today Sales", value: "INR 0", delta: "Start billing to record sales" },
  { label: "Monthly Revenue", value: "INR 0", delta: "No revenue recorded yet" },
  { label: "Total Orders", value: "0", delta: "No orders yet" },
  { label: "Inventory Value", value: "INR 0", delta: "Enter stock and prices to begin" }
];

export const revenueSeries = [
  { month: "Jan", revenue: 0 },
  { month: "Feb", revenue: 0 },
  { month: "Mar", revenue: 0 },
  { month: "Apr", revenue: 0 },
  { month: "May", revenue: 0 },
  { month: "Jun", revenue: 0 }
];

export const salesByCategory = [
  { name: "Dairy", sales: 0 },
  { name: "Rice", sales: 0 },
  { name: "Snacks", sales: 0 },
  { name: "Produce", sales: 0 }
];

export const lowStock: Array<{ name: string; sku: string; stock: number }> = [];
export const transactions: Array<{ invoice: string; customer: string; mode: string; total: number; status: string }> = [];
export const products: Array<{ name: string; sku: string; category: string; batch: string; expiry: string; stock: number; gst: number; mrp: number }> = [];
export const posProducts: Array<{ name: string; sku: string; price: number; emoji: string }> = [];

export const customers = [
  { name: "New Customer", mobile: "-", loyalty: 0, credit: "INR 0", purchases: 0 }
];

export const suppliers = [
  { name: "New Supplier", contact: "-", category: "-", pending: "INR 0", rating: "-" }
];

export const employees = [
  { id: "EMP-000", name: "No employees added", email: "-", department: "-", shift: "-", salary: 0, status: "Inactive" }
];

export const attendanceSeries = [
  { day: "Mon", present: 0 },
  { day: "Tue", present: 0 },
  { day: "Wed", present: 0 },
  { day: "Thu", present: 0 },
  { day: "Fri", present: 0 },
  { day: "Sat", present: 0 }
];

export const departments = [
  { name: "Cashier", count: 0 },
  { name: "Inventory", count: 0 },
  { name: "Billing", count: 0 },
  { name: "Warehouse", count: 0 },
  { name: "Delivery", count: 0 },
  { name: "Accounts", count: 0 },
  { name: "HR", count: 0 },
  { name: "Admin", count: 0 }
];

export const payrollRows = [
  { month: "Current Month", net: 0, bonus: 0, deductions: 0 }
];

export const tasks = [
  { title: "No tasks assigned", owner: "-", priority: "-", due: "-" }
];

export const accountingSummary = [
  { label: "Receivables", value: 0, note: "No invoices awaiting payment" },
  { label: "Payables", value: 0, note: "No supplier bills pending" },
  { label: "Expenses", value: 0, note: "No expenses recorded" },
  { label: "GST Liability", value: 0, note: "No GST liability yet" }
];

export const cashflowSeries = [
  { month: "Jan", inflow: 0, outflow: 0 },
  { month: "Feb", inflow: 0, outflow: 0 },
  { month: "Mar", inflow: 0, outflow: 0 },
  { month: "Apr", inflow: 0, outflow: 0 },
  { month: "May", inflow: 0, outflow: 0 }
];

export const paymentReminders: Array<{ party: string; amount: number; due: string }> = [];
export const vouchers: Array<{ no: string; party: string; status: string; total: number }> = [];

export const bankAccounts = [
  { name: "Cash Drawer", type: "Cash", balance: 0 },
  { name: "Bank Account", type: "Bank", balance: 0 },
  { name: "UPI Settlement", type: "Digital", balance: 0 }
];
