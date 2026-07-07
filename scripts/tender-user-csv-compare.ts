/**
 * Сравнение приложенного CSV с data/tender-gpr-articles-149.csv + импорт UI-цепочкой.
 * npx tsx scripts/tender-user-csv-compare.ts
 */
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import iconv from "iconv-lite";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { importTenderCsvFile } from "../lib/tenderCsvImportUi";

const USER_CSV = "data/(тендеры)_май.csv";
const REF_CSV = "data/tender-gpr-articles-149.csv";

type LineEnding = "CRLF" | "LF" | "CR" | "mixed";

function detectLineEnding(buf: Buffer): LineEnding {
  const crlf = (buf.toString("binary").match(/\r\n/g) ?? []).length;
  const lf = (buf.toString("binary").match(/(?<!\r)\n/g) ?? []).length;
  const cr = (buf.toString("binary").match(/\r(?!\n)/g) ?? []).length;
  if (crlf > 0 && lf === 0 && cr === 0) return "CRLF";
  if (lf > 0 && crlf === 0 && cr === 0) return "LF";
  if (cr > 0 && crlf === 0 && lf === 0) return "CR";
  return "mixed";
}

function hexHead(buf: Buffer, n = 32): string {
  return [...buf.subarray(0, n)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

function countBom(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "UTF-8 BOM (EF BB BF)";
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return "UTF-16 LE BOM";
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return "UTF-16 BE BOM";
  return null;
}

function guessEncoding(buf: Buffer): string {
  const bom = countBom(buf);
  if (bom) return bom;
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (!utf8.includes("\uFFFD")) {
    const cyr = (utf8.match(/[А-Яа-яЁё]/g) ?? []).length;
    if (cyr > 10) return "UTF-8 (valid, кириллица)";
    return "UTF-8 (valid)";
  }
  const cp = iconv.decode(buf, "win1251");
  const cyr = (cp.match(/[А-Яа-яЁё]/g) ?? []).length;
  if (cyr > 10) return "Windows-1251 (вероятно)";
  return "неизвестно / бинарный";
}

function splitRawLines(buf: Buffer): string[] {
  return buf.toString("binary").split(/\r\n|\n|\r/);
}

function sniffDelimiter(line: string): string {
  const scores: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const d of Object.keys(scores)) {
    scores[d] = (line.match(new RegExp(d === "\t" ? "\t" : `\\${d}`, "g")) ?? []).length;
  }
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]![0];
}

function parseRow(line: string, delim: string): string[] {
  // simple split for delimiter count (Excel export often quoted)
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQ = !inQ;
      cur += c;
      continue;
    }
    if (!inQ && c === delim) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function findSpecialChars(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const patterns: [string, RegExp][] = [
    ["NBSP \\u00A0", /\u00A0/g],
    ["ZWSP \\u200B", /\u200B/g],
    ["FEFF", /\uFEFF/g],
    ["CR \\r", /\r/g],
    ["TAB", /\t/g],
    ["non-breaking hyphen", /\u2011/g],
    ["en-dash", /\u2013/g],
    ["em-dash", /\u2014/g],
    ["narrow NBSP", /\u202F/g],
    ["thin space", /\u2009/g],
    ["replacement U+FFFD", /\uFFFD/g],
  ];
  for (const [name, re] of patterns) {
    const n = (text.match(re) ?? []).length;
    if (n > 0) counts[name] = n;
  }
  return counts;
}

function analyzeFile(label: string, path: string) {
  const buf = readFileSync(path);
  const smart = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));
  const utf8raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const cp1251 = iconv.decode(buf, "win1251");
  const rawLines = splitRawLines(buf);
  const nonEmptyRaw = rawLines.filter((l) => l.trim().length > 0);
  const emptyRaw = rawLines.length - nonEmptyRaw.length;
  const delim = sniffDelimiter(smart.split(/\r?\n/)[0] ?? "");
  const smartLines = smart.split(/\r?\n/);
  const colCounts = smartLines
    .filter((l) => l.trim())
    .slice(0, 20)
    .map((l) => parseRow(l, delim).length);
  const allColCounts = new Set(
    smartLines.filter((l) => l.trim()).map((l) => parseRow(l, delim).length),
  );

  return {
    label,
    path,
    bytes: buf.length,
    bom: countBom(buf),
    hexHead: hexHead(buf),
    encodingGuess: guessEncoding(buf),
    lineEnding: detectLineEnding(buf),
    rawLineCount: rawLines.length,
    emptyRawLines: emptyRaw,
    nonEmptyRawLines: nonEmptyRaw.length,
    smartLineCount: smartLines.length,
    delimiter: delim === ";" ? "semicolon" : delim === "," ? "comma" : delim === "\t" ? "tab" : delim,
    colCountsFirst20: colCounts,
    uniqueColCounts: [...allColCounts].sort((a, b) => a - b),
    specialCharsSmart: findSpecialChars(smart),
    specialCharsUtf8: findSpecialChars(utf8raw),
    firstLinesSmart: smartLines.slice(0, 8),
    headerRowIndex: smartLines.findIndex((l) =>
      /ID\s*Код|№\s*статей|Этап\s*работ|План|Факт/i.test(l),
    ),
    subHeaderRowIndex: smartLines.findIndex((l, i) => i > 0 && /План|Факт|Откл/i.test(l)),
    utf8CyrillicCount: (utf8raw.match(/[А-Яа-яЁё]/g) ?? []).length,
    cp1251CyrillicCount: (cp1251.match(/[А-Яа-яЁё]/g) ?? []).length,
    smartCyrillicCount: (smart.match(/[А-Яа-яЁё]/g) ?? []).length,
    utf8HasReplacement: utf8raw.includes("\uFFFD"),
  };
}

function diffReport(a: ReturnType<typeof analyzeFile>, b: ReturnType<typeof analyzeFile>) {
  const diffs: string[] = [];
  const keys = [
    "bytes",
    "bom",
    "encodingGuess",
    "lineEnding",
    "rawLineCount",
    "emptyRawLines",
    "nonEmptyRawLines",
    "smartLineCount",
    "delimiter",
    "utf8HasReplacement",
    "utf8CyrillicCount",
    "cp1251CyrillicCount",
    "smartCyrillicCount",
    "headerRowIndex",
    "subHeaderRowIndex",
  ] as const;
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (JSON.stringify(av) !== JSON.stringify(bv)) {
      diffs.push(`${k}: user=${JSON.stringify(av)} | ref=${JSON.stringify(bv)}`);
    }
  }
  if (JSON.stringify(a.uniqueColCounts) !== JSON.stringify(b.uniqueColCounts)) {
    diffs.push(
      `uniqueColCounts: user=${JSON.stringify(a.uniqueColCounts)} | ref=${JSON.stringify(b.uniqueColCounts)}`,
    );
  }
  if (a.hexHead !== b.hexHead) {
    diffs.push(`hexHead(32b): user=${a.hexHead} | ref=${b.hexHead}`);
  }
  if (JSON.stringify(a.specialCharsSmart) !== JSON.stringify(b.specialCharsSmart)) {
    diffs.push(
      `specialChars(smart): user=${JSON.stringify(a.specialCharsSmart)} | ref=${JSON.stringify(b.specialCharsSmart)}`,
    );
  }
  diffs.push("--- first lines (smart decode) ---");
  diffs.push("USER file:");
  a.firstLinesSmart.forEach((l, i) => diffs.push(`  [${i}] ${l.slice(0, 120)}${l.length > 120 ? "…" : ""}`));
  diffs.push("REF file:");
  b.firstLinesSmart.forEach((l, i) => diffs.push(`  [${i}] ${l.slice(0, 120)}${l.length > 120 ? "…" : ""}`));
  return diffs;
}

async function runImport(path: string) {
  const bytes = readFileSync(path);
  const file = new File([bytes], path.split(/[/\\]/).pop() ?? "user.csv", { type: "text/csv" });
  const { tenders, audit } = await importTenderCsvFile(file);
  return {
    layout: audit.layout,
    parsedRows: audit.parsedRows,
    loaded: audit.loaded,
    skipped: audit.skipped,
    tendersCount: tenders.length,
    colMapError: audit.columnMapDiagnostics?.error ?? null,
    firstSkip: audit.skippedRows[0] ?? null,
    headers: audit.headers.slice(0, 8),
  };
}

async function main() {
  console.log("=== USER CSV (единственный тестовый файл) ===");
  console.log(USER_CSV);
  const user = analyzeFile("user", USER_CSV);
  console.log(JSON.stringify(user, null, 2));

  console.log("\n=== UI import pipeline (importTenderCsvFile) ===");
  const imp = await runImport(USER_CSV);
  console.log(JSON.stringify(imp, null, 2));

  console.log("\n=== Сравнение с ref (только диагностика, не для тестов) ===");
  const ref = analyzeFile("ref", REF_CSV);
  const diffs = diffReport(user, ref);
  console.log(diffs.join("\n"));
}

void main();
