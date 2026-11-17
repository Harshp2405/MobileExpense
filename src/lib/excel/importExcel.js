import { importPortableBackup } from "../backup/portableService";
import { parseExcelFile } from "./workbookData";

export async function readExcelAsset(asset) {
  if (!asset?.name || !/\.(xlsx|csv)$/i.test(asset.name)) {
    throw new Error("Choose an .xlsx or .csv file");
  }
  if (asset.size > 20 * 1024 * 1024) throw new Error("Choose a file smaller than 20 MiB");
  let bytes;
  if (asset.file) bytes = await asset.file.arrayBuffer();
  else {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error("Could not read the selected file");
    bytes = await response.arrayBuffer();
  }
  return parseExcelFile(bytes, asset.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv");
}

export function importExcelData(parsed) {
  return importPortableBackup({ tables: parsed.tables }, parsed.options);
}

export function describeExcelCounts(counts) {
  return Object.entries(counts).map(([table, count]) =>
    `${table}: ${count.added} added, ${count.skipped} skipped`).join("; ");
}
