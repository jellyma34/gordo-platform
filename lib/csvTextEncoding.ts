/**
 * Чтение CSV из браузера: Excel (RU) часто сохраняет как Windows-1251, тогда как
 * `File.text()` всегда интерпретирует байты как UTF-8 → «кракозябры» или `?`.
 */

/** Убрать BOM UTF-8 из начала строки. */
function stripUtf8Bom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

/**
 * Декодирует байты CSV: UTF-8 если валиден, иначе Windows-1251.
 */
export function decodeCsvBytesWithBestEncoding(bytes: Uint8Array): string {
  const utf8 = stripUtf8Bom(new TextDecoder("utf-8", { fatal: false }).decode(bytes));

  // Валидный UTF-8 без U+FFFD — не сравнивать с CP1251 (мисдекод даёт ложную «кириллицу»).
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }

  let cp1251: string;
  try {
    cp1251 = new TextDecoder("windows-1251").decode(bytes);
  } catch {
    return utf8;
  }

  return cp1251;
}

/** Читает `File` как CSV с подбором кодировки (UTF-8 vs Windows-1251). */
export async function readCsvFileTextSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
}
