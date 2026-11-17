import { collectPortableBackupWithWarnings } from "../backup/portableService";
import { describeSkipped } from "../backup/portableData";
import { saveExcelWorkbook } from "./exportExcel";
import { createDatabaseWorkbook } from "./workbookData";

export async function exportDatabaseToExcel() {
  const { backup, skipped } = collectPortableBackupWithWarnings();
  const workbook = createDatabaseWorkbook(backup.tables);
  const fileName = `Expense_Database_${new Date().toISOString().replace(/[:.]/g, "-")}.xlsx`;
  const saved = await saveExcelWorkbook(workbook, fileName);
  return `Saved ${saved.fileName} to ${saved.location}.${describeSkipped(skipped)}`;
}
