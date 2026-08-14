import { NextRequest, NextResponse } from "next/server";

import { hasSectionAccess, isApiSection, type ApiSection, type Role } from "@/lib/authTypes";

const MOCK_DEV_TOKEN = "mock-dev-token";

function backendBaseUrl(): string {
  const raw =
    process.env.BACKEND_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:8000";
  return raw.replace(/\/$/, "");
}

function tokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const cookie = req.cookies.get("gordo_token")?.value;
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie);
  } catch {
    return cookie;
  }
}

function parseRole(raw: unknown): Role {
  if (raw === "admin" || raw === "manager" || raw === "employee") return raw;
  return "employee";
}

/** 401/403 или null, если доступ к разделу разрешён. */
export async function denyUnlessSectionAccess(
  req: NextRequest,
  section: ApiSection,
): Promise<NextResponse | null> {
  const token = tokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (token === MOCK_DEV_TOKEN) {
    return null;
  }
  try {
    const res = await fetch(`${backendBaseUrl()}/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: "Нет доступа к разделу" }, { status: 403 });
    }
    const user = (await res.json()) as { role?: unknown; allowed_sections?: unknown };
    const role = parseRole(user.role);
    const raw = Array.isArray(user.allowed_sections) ? user.allowed_sections : [];
    const allowed = raw.filter((x): x is ApiSection => typeof x === "string" && isApiSection(x));
    if (!hasSectionAccess(role, allowed, section)) {
      return NextResponse.json({ error: "Нет доступа к разделу" }, { status: 403 });
    }
    return null;
  } catch {
    return NextResponse.json({ error: "Нет доступа к разделу" }, { status: 403 });
  }
}
