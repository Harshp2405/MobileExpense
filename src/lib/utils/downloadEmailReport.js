export async function downloadEmailReport({
  expenses,
  fuelLogs,
  monthName,
  year,
  totalSpent,
  fuelTotal,
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF();
  let y = 18;
  const line = (value) => {
    const lines = pdf.splitTextToSize(String(value ?? ""), 174);
    for (const text of lines) {
      if (y > 278) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(text, 18, y);
      y += 6;
    }
  };
  pdf.setFontSize(12);
  line(`Expense and Fuel Report - ${monthName} ${year}`);
  line(`Expenses: INR ${totalSpent.toFixed(2)}`);
  line(`Fuel: INR ${fuelTotal.toFixed(2)}`);
  line(`Combined: INR ${(totalSpent + fuelTotal).toFixed(2)}`);
  line("Generated from local data. Income is not included.");
  line("");
  line("Expenses");
  if (!expenses.length) line("No expenses recorded.");
  for (const item of expenses) {
    line(`${item.title} - INR ${Number(item.amount).toFixed(2)}`);
    line(`${item.date || "-"} | ${item.category || "Other"}${item.subcategory ? ` / ${item.subcategory}` : ""} | ${item.method || "Cash"}`);
    if (item.description) line(item.description);
    line("");
  }
  line("Fuel logs");
  if (!fuelLogs.length) line("No fuel logs recorded.");
  for (const log of fuelLogs) {
    line(`${log.date || "-"} - INR ${Number(log.totalCost).toFixed(2)}`);
    line(`Litres: ${log.litres} | Price/litre: INR ${log.pricePerLitre}`);
    line(`Odometer: ${log.startKm ?? "-"} to ${log.odometerKm ?? "Pending"}`);
    if (log.note) line(log.note);
    line("");
  }
  const fileName = `Expense_and_Fuel_Report_${monthName}_${year}.pdf`;
  await pdf.save(fileName, { returnPromise: true });
  return fileName;
}
