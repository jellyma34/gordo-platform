"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Обзор", match: (p: string) => p === "/admin" },
  { href: "/admin/users", label: "Пользователи", match: (p: string) => p.startsWith("/admin/users") },
  { href: "/admin/history", label: "История", match: (p: string) => p.startsWith("/admin/history") },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200">
      {LINKS.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? "-mb-px border-b-2 border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            }
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
