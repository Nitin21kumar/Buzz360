import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";

import { ValidationError } from "../../core/errors";

const PHONE_COLUMN_CANDIDATES = new Set([
  "phone",
  "phone no",
  "phone number",
  "phone_number",
  "mobile",
  "mobile no",
  "mobile number",
  "number",
  "contact",
]);

export interface ParsedContacts {
  numbers: string[];
  totalRows: number;
  blankRows: number;
  extraSheets: number;
}

async function rowsFromXlsx(buffer: Buffer): Promise<{ rows: Record<string, string>[]; extraSheets: number }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], extraSheets: 0 };

  const header: string[] = [];
  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1);
    if (rowNumber === 1) {
      values.forEach((v) => header.push(String(v ?? "").trim()));
      return;
    }
    const record: Record<string, string> = {};
    values.forEach((v, i) => {
      if (header[i]) record[header[i]] = v === null || v === undefined ? "" : String(v);
    });
    rows.push(record);
  });
  return { rows, extraSheets: Math.max(0, workbook.worksheets.length - 1) };
}

function rowsFromCsv(buffer: Buffer): Record<string, string>[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
}

export async function extractPhoneNumbers(filename: string, buffer: Buffer): Promise<ParsedContacts> {
  const isExcel = /\.xlsx?$/i.test(filename);
  let rows: Record<string, string>[];
  let extraSheets = 0;
  if (isExcel) {
    const parsed = await rowsFromXlsx(buffer);
    rows = parsed.rows;
    extraSheets = parsed.extraSheets;
  } else {
    rows = rowsFromCsv(buffer);
  }

  if (!rows.length) return { numbers: [], totalRows: 0, blankRows: 0, extraSheets };

  const columns = Object.keys(rows[0]);
  const phoneColumn = columns.find((c) => PHONE_COLUMN_CANDIDATES.has(c.trim().toLowerCase()));
  if (!phoneColumn) {
    throw new ValidationError(
      `Phone number column not found. Columns found: ${columns.join(", ")} — expected one of: phone, mobile, phone number, contact`
    );
  }

  const numbers: string[] = [];
  let blankRows = 0;
  for (const r of rows) {
    const v = String(r[phoneColumn] ?? "").trim();
    if (!v || v.toLowerCase() === "nan") {
      blankRows += 1;
      continue;
    }
    numbers.push(v);
  }

  return { numbers, totalRows: rows.length, blankRows, extraSheets };
}
