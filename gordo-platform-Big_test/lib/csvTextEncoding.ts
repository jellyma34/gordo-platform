/**
 * Чтение CSV из браузера: Excel (RU) часто сохраняет как Windows-1251, тогда как
 * `File.text()` всегда интерпретирует байты как UTF-8 → «кракозябры» или `?`.
 */

function countCyrillicLetters(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04ff) n++;
  }
  return n;
}

/** Убрать BOM UTF-8 из начала строки. */
function stripUtf8Bom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

/**
 * Декодирует байты CSV: выбирает UTF-8 или Windows-1251 по доле кириллицы и U+FFFD.
 */
export function decodeCsvBytesWithBestEncoding(bytes: Uint8Array): string {
  const utf8 = stripUtf8Bom(new TextDecoder("utf-8", { fatal: false }).decode(bytes));

  let cp1251: string;
  try {
    cp1251 = new TextDecoder("windows-1251").decode(bytes);
  } catch {
    return utf8;
  }

  if (utf8.includes("\uFFFD")) {
    return cp1251;
  }

  const cyUtf = countCyrillicLetters(utf8);
  const cyCp = countCyrillicLetters(cp1251);

  // Русский CSV из Excel (CP1251), открытый как UTF-8: мало корректной кириллицы в UTF-8
  if (cyCp > cyUtf + 3) {
    return cp1251;
  }

  // Файл уже в UTF-8 с русским текстом
  if (cyUtf > cyCp + 3) {
    return utf8;
  }

  return utf8;
}

/** Читает `File` как CSV с подбором кодировки (UTF-8 vs Windows-1251). */
export async function readCsvFileTextSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
}
