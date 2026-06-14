import { NextResponse } from "next/server";

/** Лёгкий ответ 200 для проверок (можно указать путь в настройках сервиса). */
export function GET() {
  return new NextResponse("ok", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
