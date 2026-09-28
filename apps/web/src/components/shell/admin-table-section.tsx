import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface AdminTableSectionProps {
  title: string;
  description: string;
  addLabel?: string;
  addHref?: string;
  headers: ReactNode[];
  children: ReactNode;
  footer?: ReactNode;
}

export function AdminTableSection({
  title,
  description,
  addLabel,
  addHref,
  headers,
  children,
  footer
}: AdminTableSectionProps) {
  return (
    <Card>
      <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {addLabel && addHref ? (
          <Button asChild>
            <Link href={addHref}>
              <Plus data-icon="inline-start" />
              {addLabel}
            </Link>
          </Button>
        ) : addLabel ? (
          <Button>
            <Plus data-icon="inline-start" />
            {addLabel}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header, index) => (
                  <TableHead key={index}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>{children}</TableBody>
          </Table>
        </div>
        {footer ? (
          footer
        ) : (
          <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span>分页：第 1 页 / 共 1 页</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                上一页
              </Button>
              <Button variant="outline" size="sm">
                下一页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
