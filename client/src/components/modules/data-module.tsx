import { Download, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Row = Record<string, string | number>;

export function DataModule({ title, description, rows }: { title: string; description: string; rows: Row[] }) {
  const columns = Object.keys(rows[0] ?? {});
  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><h1 className="text-3xl font-semibold tracking-tight">{title}</h1><p className="text-muted-foreground">{description}</p></div><Button variant="outline"><Download className="size-4" /> Export</Button></div>
      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between"><CardTitle>Records</CardTitle><div className="flex gap-2"><Input icon={Search} placeholder="Search records" /><Button variant="outline" size="icon"><Filter className="size-4" /></Button></div></CardHeader>
        <CardContent className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-muted-foreground"><tr>{columns.map((column) => <th className="py-2 capitalize" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className="border-t" key={index}>{columns.map((column) => <td className="py-3" key={column}>{row[column]}</td>)}</tr>)}</tbody></table></CardContent>
      </Card>
    </section>
  );
}
