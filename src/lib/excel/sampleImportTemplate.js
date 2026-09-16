import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export const downloadSampleExcelTemplate = async () => {
  const csv = `title,amount,category,subcategory,method,date,description,month
Groceries,1200.00,Food,Daily Needs,Cash,15/09/2026,Weekly groceries,2026-09
Fuel,2500.00,Transport,Petrol,Card,20/09/2026,Petrol refill,2026-09
Rent,18000.00,Home,Apartment,UPI,01/09/2026,Monthly rent,2026-09
`;

  const fileUri = `${FileSystem.documentDirectory}expense_import_sample.csv`;
  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(fileUri, {
    mimeType: "text/csv",
    dialogTitle: "Download Expense Import Template",
  });

  return fileUri;
};
