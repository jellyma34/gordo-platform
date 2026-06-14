import fs from "fs";

import { decodeCsvBytesWithBestEncoding } from "../lib/csvTextEncoding";
import { normalizeTenderCsvRowsWithAudit, parseTenderCsvText } from "../lib/tenderCsvImport";

const buf = fs.readFileSync("data/tender-import-sample.csv");
const utf8 = fs.readFileSync("data/tender-import-sample.csv", "utf8");
const smart = decodeCsvBytesWithBestEncoding(new Uint8Array(buf));

for (const [label, text] of [
  ["utf8", utf8],
  ["smart", smart],
] as const) {
  const p = parseTenderCsvText(text);
  const { audit } = normalizeTenderCsvRowsWithAudit(p.rows, p.headers, {
    layout: p.layout,
    dataStartFileRow: p.dataStartFileRow,
  });
  console.log(label, "loaded", audit.loaded, "skipped", audit.skipped);
  if (audit.skippedRows[0]) console.log("  first skip:", audit.skippedRows[0]);
  console.log("  header[0]:", JSON.stringify(p.headers[0]));
}
