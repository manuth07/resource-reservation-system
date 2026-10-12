import type { ReactNode } from "react";
import { NavigationLink as Link } from "@/components/navigation-link";
import { WorkspaceNavigation, WorkspaceSectionLabel } from "@/components/workspace-navigation";
import { Button } from "@/components/ui";

/** Presentation only. The protected layout supplies an already-authorized identity. */
export function WorkspaceShell({
  children,
  employeeId,
  roleLabel,
  isAdmin,
  logoutAction,
}: {
  children: ReactNode;
  employeeId: string;
  roleLabel: string;
  isAdmin: boolean;
  logoutAction: () => Promise<void>;
}) {
  const initials = employeeId.slice(0, 2).toUpperCase();

  return (
    <div className="workspace-shell">
      <a href="#workspace-main" className="skip-link">
        Skip to main content
      </a>

      {/* Desktop Persistent Sidebar */}
      <aside className="workspace-sidebar" aria-label="Sidebar">
        <div className="sidebar-brand-block">
          <Link href="/dashboard" className="brand sidebar-brand">
            PrimeWave
          </Link>
          <p className="sidebar-caption">Resource reservation</p>
        </div>

        <WorkspaceNavigation isAdmin={isAdmin} />

        {/* Single Account Control in the sidebar footer */}
        <div className="sidebar-footer">
          <details className="sidebar-account-menu">
            <summary className="sidebar-account-summary">
              <span className="sidebar-avatar" aria-hidden="true">
                {initials}
              </span>
              <div className="sidebar-account-info">
                <p className="sidebar-employee">{employeeId}</p>
                <p className="sidebar-role">{roleLabel}</p>
              </div>
              <span className="sidebar-account-chevron" aria-hidden="true">
                ▾
              </span>
            </summary>
            <div className="sidebar-account-dropdown">
              <Link href="/change-password" className="sidebar-account-item">
                Change password
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="sidebar-account-item sidebar-signout-btn">
                  Sign out
                </button>
              </form>
            </div>
          </details>
        </div>
      </aside>

      {/* Main Workspace Stage */}
      <div className="workspace-stage">
        {/* Clean Topbar: Breadcrumb context on desktop, mobile drawer on mobile */}
        <header className="workspace-topbar">
          <div className="workspace-topbar-start">
            <WorkspaceNavigation isAdmin={isAdmin} mobile />
            <WorkspaceSectionLabel />
          </div>

          {/* Mobile-only account menu (hidden on desktop via CSS media query) */}
          <div className="mobile-account-bar">
            <details className="mobile-account-menu">
              <summary className="mobile-account-summary" aria-label="Account options">
                <span className="sidebar-avatar" aria-hidden="true">
                  {initials}
                </span>
              </summary>
              <div className="mobile-account-dropdown space-y-3">
                <div>
                  <p className="break-all font-medium text-foreground">{employeeId}</p>
                  <p className="supporting-text">{roleLabel}</p>
                </div>
                <Link href="/change-password" className="text-link block py-1">
                  Change password
                </Link>
                <form action={logoutAction}>
                  <Button variant="secondary" type="submit" className="w-full">
                    Sign out
                  </Button>
                </form>
              </div>
            </details>
          </div>
        </header>

        <main id="workspace-main" tabIndex={-1} className="workspace-content">
          {children}
        </main>
      </div>
    </div>
  );
}
