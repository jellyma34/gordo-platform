"use client";

import { useEffect } from "react";

import { getApiUrl } from "@/lib/auth";

/** Один раз при загрузке клиента: базовый URL API (через getApiUrl на момент вызова). */
export function LogApiUrl() {
  useEffect(() => {
    console.log(getApiUrl());
  }, []);
  return null;
}
