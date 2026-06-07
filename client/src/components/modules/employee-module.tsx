"use client";

import { CalendarCheck, Download, FileText, Fingerprint, Plus, Search, UserRoundCheck, Users, type LucideIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { attendanceSeries, departments, employees, payrollRows, tasks } from "@/lib/demo-data";
import { formatCurrency } from "@/lib/utils";

export function EmployeeModule() {
  const kpiCards: Array<{ label: string; value: string; icon: LucideIcon }> = [
    { label: "Total Employees", value: "0", icon: Users },
    { label: "Active Employees", value: "0", icon: UserRoundCheck },
    { label: "Attendance Today", value: "0%", icon: CalendarCheck },
    { label: "Payroll Due", value: "INR 0", icon: FileText }
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div><h1 className="text-3xl font-semibold tracking-tight">Employee Management</h1><p className="text-muted-foreground">HRMS dashboard, attendance, leave, payroll, performance, tasks, documents, and self-service portal.</p></div>
        <div className="flex gap-2"><Button variant="outline"><Download className="size-4" /> Export</Button><Button><Plus className="size-4" /> Register Employee</Button></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map(({ label, value, icon: Icon }) => <Card key={label}><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle><Icon className="size-5 text-primary" /></CardHeader><CardContent><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">Across all branches</p></CardContent></Card>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between"><CardTitle>Employee Directory</CardTitle><Input icon={Search} placeholder="Search employee, department, role" /></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2">Employee</th><th>ID</th><th>Department</th><th>Shift</th><th>Salary</th><th>Status</th></tr></thead>
              <tbody>{employees.map((e) => <tr className="border-t" key={e.id}><td className="py-3 font-medium">{e.name}<span className="block text-xs text-muted-foreground">{e.email}</span></td><td>{e.id}</td><td>{e.department}</td><td>{e.shift}</td><td>{formatCurrency(e.salary)}</td><td><span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{e.status}</span></td></tr>)}</tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Attendance Summary</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={attendanceSeries}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" /><YAxis /><Tooltip /><Area type="monotone" dataKey="present" stroke="#059669" fill="#05966933" strokeWidth={3} /></AreaChart></ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card><CardHeader><CardTitle>Departments & Designations</CardTitle></CardHeader><CardContent className="space-y-3">{departments.map((d) => <div className="flex items-center justify-between rounded-md border p-3" key={d.name}><span className="text-sm font-medium">{d.name}</span><span className="text-sm text-muted-foreground">{d.count} staff</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Payroll Management</CardTitle></CardHeader><CardContent className="space-y-3">{payrollRows.map((p) => <div className="rounded-md border p-3" key={p.month}><div className="flex justify-between text-sm font-medium"><span>{p.month}</span><span>{formatCurrency(p.net)}</span></div><p className="mt-1 text-xs text-muted-foreground">Bonus {formatCurrency(p.bonus)} - Deductions {formatCurrency(p.deductions)}</p></div>)}<Button className="w-full" variant="outline"><FileText className="size-4" /> Generate Payslips PDF</Button></CardContent></Card>
        <Card><CardHeader><CardTitle>Tasks & Performance</CardTitle></CardHeader><CardContent className="space-y-3">{tasks.map((t) => <div className="rounded-md border p-3" key={t.title}><div className="flex justify-between"><p className="text-sm font-medium">{t.title}</p><span className="text-xs text-accent">{t.priority}</span></div><p className="mt-1 text-xs text-muted-foreground">{t.owner} - Due {t.due}</p></div>)}<Button className="w-full" variant="accent"><Fingerprint className="size-4" /> Biometric API Ready</Button></CardContent></Card>
      </div>
    </section>
  );
}
