"use client";

import { useRef } from "react";
import { NavigationLink } from "@/components/navigation-link";
import { usePathname } from "next/navigation";

const workspaceItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/resources", label: "Resource catalog" },
  { href: "/transport/request", label: "Request transport" },
  { href: "/reservations", label: "My reservations" },
];
const departmentItems = [
  { href: "/department/approvals", label: "Approval queue" },
];
const adminItems = [
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/resource-categories", label: "Categories" },
  { href: "/admin/employees", label: "Employees" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/drivers", label: "Drivers" },
  { href: "/admin/reservations", label: "Reservation requests" },
];
const currentItem = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export function WorkspaceSectionLabel() {
  const pathname = usePathname();
  const section =
    [...workspaceItems, ...departmentItems, ...adminItems].find((item) =>
      currentItem(pathname, item.href),
    )?.label ?? "Workspace";
  const parent = pathname.startsWith("/admin/")
    ? "Administration"
    : pathname.startsWith("/department/")
      ? "Department"
      : "Workspace";
  return (
    <p className="workspace-context">
      <span>{parent}</span>
      <span aria-hidden="true">/</span>
      <span className="font-medium text-foreground">{section}</span>
    </p>
  );
}

export function WorkspaceNavigation({
  isAdmin,
  isDepartmentHead = false,
  mobile = false,
}: {
  isAdmin: boolean;
  isDepartmentHead?: boolean;
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const close = () => { if (disclosure.current) disclosure.current.open = false; };
  const groups = [
    { label: "Workspace", items: workspaceItems },
    ...(isDepartmentHead ? [{ label: "Department", items: departmentItems }] : []),
    ...(isAdmin ? [{ label: "Administration", items: adminItems }] : []),
  ];
  const navigation = <nav aria-label={mobile ? "Mobile workspace navigation" : "Workspace navigation"} className="app-navigation">
    {groups.map((group) => <div key={group.label} className="navigation-group">
      <p className="navigation-label">{group.label}</p>
      <ul className="space-y-1">{group.items.map((item) => <li key={item.href}>
        <NavigationLink className="nav-link" href={item.href} aria-current={currentItem(pathname, item.href) ? "page" : undefined} onNavigate={mobile ? close : undefined}>{item.label}</NavigationLink>
      </li>)}</ul>
    </div>)}
  </nav>;
  if (!mobile) return navigation;
  return <details ref={disclosure} className="mobile-navigation" onKeyDown={(event) => { if (event.key === "Escape" && disclosure.current?.open) { close(); summary.current?.focus(); } }}>
    <summary ref={summary}>Menu</summary>
    <div className="mobile-navigation-panel">{navigation}</div>
  </details>;
}
