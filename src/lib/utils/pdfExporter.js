import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";

export const exportToPDF = async ({
  expenses = [],
  fuelLogs = [],
  monthName,
  year,
  totalSpent = 0,
  fuelTotal = 0,
  combinedTotal = 0,
}) => {
  const totalFuelLitres = fuelLogs.reduce(
    (total, log) => total + Number(log.litres || 0),
    0,
  );

  const totalFuelKm = fuelLogs.reduce((total, log) => {
    if (log.startKm == null || log.odometerKm == null) return total;

    const driven = Number(log.odometerKm) - Number(log.startKm);
    return driven > 0 ? total + driven : total;
  }, 0);

  const averageKmPerLitre =
    totalFuelKm > 0 && totalFuelLitres > 0
      ? totalFuelKm / totalFuelLitres
      : null;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

      const fuelSummaryHtml =
        fuelLogs.length === 0
          ? `
      <section class="fuel-section">
        <div class="section-heading"><h2>Fuel Summary</h2></div>
        <p class="empty-section">No fuel logs recorded for this month.</p>
      </section>
    `
          : `
      <section class="fuel-section">
        <div class="section-heading">
          <h2>Fuel Summary</h2>
          <span>${monthName} ${year}</span>
        </div>
        <div class="fuel-summary">
          <div class="fuel-stat">
            <span>Total Fuel Cost</span>
            <strong>₹${Number(fuelTotal).toFixed(2)}</strong>
          </div>
          <div class="fuel-stat">
            <span>Fuel Used</span>
            <strong>${totalFuelLitres.toFixed(2)} L</strong>
          </div>
          <div class="fuel-stat">
            <span>Distance</span>
            <strong>${totalFuelKm.toFixed(1)} km</strong>
          </div>
          <div class="fuel-stat">
            <span>Average</span>
            <strong>${averageKmPerLitre ? `${averageKmPerLitre.toFixed(2)} km/L` : "Pending"}</strong>
          </div>
        </div>
      </section>
    `;

    const fuelTableHtml =
      fuelLogs.length === 0
        ? ""
        : `
      <h2 class="section-title">Fuel Fill-up History</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Odometer</th>
            <th>Fuel</th>
            <th>Price/L</th>
            <th>Efficiency</th>
            <th style="text-align: right;">Cost</th>
          </tr>
        </thead>
        <tbody>
          ${fuelLogs
            .map((log) => {
              const hasEndReading =
                log.startKm != null &&
                log.odometerKm != null &&
                Number(log.odometerKm) > Number(log.startKm);
              const driven = hasEndReading
                ? Number(log.odometerKm) - Number(log.startKm)
                : 0;
              const mileage =
                driven > 0 && Number(log.litres) > 0
                  ? driven / Number(log.litres)
                  : null;

              return `
                <tr>
                  <td>${escapeHtml(log.date || "-")}</td>
                  <td>${Number(log.startKm || 0).toFixed(0)} → ${hasEndReading ? Number(log.odometerKm).toFixed(0) : "Pending"}</td>
                  <td>${Number(log.litres || 0).toFixed(2)} L</td>
                  <td>₹${Number(log.pricePerLitre || 0).toFixed(2)}</td>
                  <td>${mileage ? `${mileage.toFixed(2)} km/L` : "Pending"}</td>
                  <td class="amount-val">₹${Number(log.totalCost || 0).toFixed(2)}</td>
                </tr>
                ${log.note ? `<tr class="note-row"><td colspan="6">Note: ${escapeHtml(log.note)}</td></tr>` : ""}
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;


  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Expense Report - ${monthName} ${year}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
        body {
          font-family: 'Inter', sans-serif;
          color: #1F2937;
          margin: 0;
          padding: 40px;
          background-color: #FFFFFF;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #F3F4F6;
          padding-bottom: 24px;
          margin-bottom: 30px;
        }
          .tag-subcategory {
  background: #E0E7FF;
  color: #4338CA;
}
        .title-area h1 {
          font-size: 28px;
          font-weight: 900;
          color: #111827;
          margin: 0 0 4px 0;
          letter-spacing: -0.05em;
        }
        .title-area p {
          font-size: 14px;
          color: #6B7280;
          margin: 0;
          font-weight: 500;
        }
        .meta-area {
          text-align: right;
        }
        .meta-area .date {
          font-size: 18px;
          color: #2563EB;
          font-weight: 800;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .meta-area .sub {
          font-size: 12px;
          color: #9CA3AF;
        }
        .stats-container {
          display: flex;
          gap: 12px;
          margin-bottom: 30px;
        }
        .stat-card {
  flex: 1;
  min-width: 0;
  border: 1px solid #E5E7EB;
  border-radius: 16px;
  padding: 16px;
  background: #F9FAFB;
}
        .stat-card .label {
          font-size: 11px;
          font-weight: 700;
          color: #6B7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        .stat-card .value {
          font-size: 22px;
          font-weight: 900;
          color: #111827;
        }
        .stat-card .value.primary {
          color: #2563EB;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background-color: #F9FAFB;
          color: #374151;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: left;
          padding: 14px 16px;
          border-bottom: 2px solid #E5E7EB;
        }
        td {
          padding: 16px;
          font-size: 14px;
          border-bottom: 1px solid #F3F4F6;
          color: #4B5563;
        }
        .expense-title {
          font-weight: 600;
          color: #111827;
        }
        .expense-desc {
          font-size: 12px;
          color: #9CA3AF;
          margin-top: 4px;
        }
        .tag {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .tag-category {
          background-color: #EFF6FF;
          color: #2563EB;
        }
        .tag-method {
          background-color: #F3F4F6;
          color: #4B5563;
        }
        .amount-val {
          font-weight: 700;
          color: #111827;
          text-align: right;
        }
        .footer {
          text-align: center;
          font-size: 12px;
          color: #9CA3AF;
          border-top: 1px solid #F3F4F6;
          padding-top: 20px;
          margin-top: 50px;
        }
          .section-title {
  margin: 36px 0 14px;
  color: #111827;
  font-size: 18px;
  font-weight: 800;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  border-bottom: 2px solid #F3F4F6;
  padding-bottom: 12px;
}

.section-heading h2 {
  margin: 0;
  color: #111827;
  font-size: 20px;
  font-weight: 800;
}

.section-heading span {
  color: #6B7280;
  font-size: 12px;
}

.fuel-section {
  margin-top: 36px;
}

.fuel-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 22px;
}

.fuel-stat {
  flex: 1;
  min-width: 0;
  border: 1px solid #DBEAFE;
  border-radius: 12px;
  padding: 14px;
  background: #EFF6FF;
}

.fuel-stat span {
  display: block;
  margin-bottom: 6px;
  color: #6B7280;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.fuel-stat strong {
  color: #1D4ED8;
  font-size: 16px;
}

.note-row td {
  padding-top: 0;
  color: #9CA3AF;
  font-size: 11px;
  font-style: italic;
}

.empty-section {
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 20px;
  color: #9CA3AF;
  background: #F9FAFB;
  text-align: center;
}

      </style>
    </head>
    <body>
      <div class="header">
        <div class="title-area">
          <h1>Expense Report</h1>
          <p>Monthly overview of all records</p>
        </div>
        <div class="meta-area">
          <div class="date">${escapeHtml(monthName)} ${Number(year)}</div>
          <div class="sub">Generated on ${new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div class="stats-container">
  <div class="stat-card">
    <div class="label">All Spending</div>
    <div class="value primary">₹${Number(combinedTotal).toFixed(2)}</div>
  </div>
  <div class="stat-card">
    <div class="label">Expenses</div>
    <div class="value">₹${Number(totalSpent).toFixed(2)}</div>
  </div>
  <div class="stat-card">
    <div class="label">Fuel</div>
    <div class="value">₹${Number(fuelTotal).toFixed(2)}</div>
  </div>
  <div class="stat-card">
    <div class="label">Records</div>
    <div class="value">${expenses.length + fuelLogs.length}</div>
  </div>
</div>


      <table>
        <thead>
          <tr>
            <th>Expense</th>
            <th>Category</th>
            <th>Method</th>
            <th>Date</th>
            <th style="text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${expenses
            .map(
              (e) => `
            <tr>
              <td>
                <div class="expense-title">${escapeHtml(e.title)}</div>
                ${e.description ? `<div class="expense-desc">${escapeHtml(e.description)}</div>` : ""}
              </td>
              <td>
  <span class="tag tag-category">${escapeHtml(e.category || "Other")}</span>
  ${e.subcategory ? `<span class="tag tag-subcategory">${escapeHtml(e.subcategory)}</span>` : ""}
</td>
              
              <td><span class="tag tag-method">${escapeHtml(e.method || "Cash")}</span></td>
              <td>${escapeHtml(e.date)}</td>
              <td class="amount-val">₹${Number(e.amount || 0).toFixed(2)}</td>
            </tr>
          `,
            )
            .join("")}
        </tbody>
      </table>

      ${fuelSummaryHtml}
      ${fuelTableHtml}

      <div class="footer">
        Generated automatically by Expense Tracker Mobile App
      </div>
    </body>
    </html>
  `;

  try {
    // 1. Generate the raw PDF file
    const { uri: tempUri } = await Print.printToFileAsync({
      html: htmlContent,
    });

    // 2. Format a pristine filename
    const cleanFilename =
      `Expense_and_Fuel_Report_${monthName}_${year}.pdf`.replace(/\s+/g, "_");
    const targetUri = `${FileSystem.documentDirectory}${cleanFilename}`;

    // 3. Move the file from temporary cache to a pristine document path
    await FileSystem.copyAsync({
      from: tempUri,
      to: targetUri,
    });

    // 4. Trigger Native Save & Sharing popup with custom filename
    await Sharing.shareAsync(targetUri, {
      mimeType: "application/pdf",
      dialogTitle: `Download Expense and Fuel Report - ${monthName} ${year}`,
      UTI: "com.adobe.pdf",
    });

    return targetUri;
  } catch (error) {
    console.error("PDF generation/sharing failed", error);
    throw error;
  }
};
