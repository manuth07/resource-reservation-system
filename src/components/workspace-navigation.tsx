"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function WorkspaceNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = [{ href: "/dashboard", label: "Dashboard" }];
  if (isAdmin) items.push({ href: "/admin/employees", label: "Employees" });
  const section = items.find((item) => pathname === item.href)?.label ?? "Workspace";
  return (
    <nav aria-label="Workspace navigation" className="app-navigation">
      <p className="mb-4 px-4 text-xs text-muted">Current section: <span className="font-semibold text-secondary">{section}</span></p>
      <ul className="flex flex-wrap gap-2 md:block md:space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link className="nav-link" href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
