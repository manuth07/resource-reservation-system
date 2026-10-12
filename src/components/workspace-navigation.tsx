"use client";

import { NavigationLink } from "@/components/navigation-link";
import { usePathname } from "next/navigation";

export function WorkspaceNavigation({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = [{ href: "/dashboard", label: "Dashboard" }, { href: "/resources", label: "Resources" }];
  if (isAdmin) items.push({ href: "/admin/employees", label: "Employees" }, { href: "/admin/resources", label: "Manage resources" }, { href: "/admin/resource-categories", label: "Resource categories" });
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const section = items.find((item) => current(item.href))?.label ?? "Workspace";
  return (
    <nav aria-label="Workspace navigation" className="app-navigation">
      <p className="mb-4 px-4 text-xs text-muted">Current section: <span className="font-semibold text-secondary">{section}</span></p>
      <ul className="flex flex-wrap gap-2 md:block md:space-y-2">
        {items.map((item) => (
          <li key={item.href}>
            <NavigationLink className="nav-link flex items-center justify-between gap-2" href={item.href} aria-current={current(item.href) ? "page" : undefined}>{item.label}</NavigationLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
