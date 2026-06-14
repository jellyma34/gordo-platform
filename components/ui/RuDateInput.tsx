"use client";

import { useEffect, useState } from "react";
import {
  digitsToDmyFormatted,
  isoToRuDmy,
  normalizePastedOrTypedToDigits,
  parseRuDmyToIso,
  RU_DATE_PLACEHOLDER,
  toIsoDateOnly,
} from "@/lib/ruIsoDate";

export type RuDateInputProps = {
  /** ISO YYYY-MM-DD или пусто */
  value: string | null | undefined;
  onChange: (iso: string) => void;
  /**
   * Если true, пустой blur вызывает onChange("").
   * Если false (плановые даты), пустое поле при blur откатывается к value.
   */
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  id?: string;
};

export function RuDateInput({
  value,
  onChange,
  allowEmpty = true,
  disabled,
  className,
  title,
  id,
}: RuDateInputProps) {
  const iso = toIsoDateOnly(value);
  const [text, setText] = useState(() => (iso ? isoToRuDmy(iso) : ""));

  useEffect(() => {
    setText(iso ? isoToRuDmy(iso) : "");
  }, [iso]);

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={RU_DATE_PLACEHOLDER}
      title={title}
      disabled={disabled}
      className={className}
      maxLength={10}
      value={text}
      onChange={(e) => {
        const digits = normalizePastedOrTypedToDigits(e.target.value);
        const formatted = digitsToDmyFormatted(digits);
        setText(formatted);
        if (digits.length === 8) {
          const parsed = parseRuDmyToIso(formatted);
          if (parsed) onChange(parsed);
        }
      }}
      onBlur={() => {
        const digits = text.replace(/\D/g, "");
        if (digits.length === 0) {
          if (allowEmpty) {
            onChange("");
            setText("");
          } else {
            setText(iso ? isoToRuDmy(iso) : "");
          }
          return;
        }
        const parsed = parseRuDmyToIso(text);
        if (parsed) {
          onChange(parsed);
          setText(isoToRuDmy(parsed));
        } else {
          setText(iso ? isoToRuDmy(iso) : "");
        }
      }}
    />
  );
}
