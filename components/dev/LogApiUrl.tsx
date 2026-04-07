"use client";

import { useEffect } from "react";

import { API_URL } from "@/lib/auth";

/** Один раз при загрузке клиента: какой базовый URL API зашит в сборку. */
export function LogApiUrl() {
  useEffect(() => {
    console.log(API_URL);
  }, []);
  return null;
}
