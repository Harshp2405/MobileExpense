import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

export const exportToPDF = async ({ expenses, monthName, year, totalSpent }) => {
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
          gap: 20px;
          margin-bottom: 30px;
        }
        .stat-card {
          flex: 1;
          background-color: #F9FAFB;
          border: 1px solid #E5E7EB;
          border-radius: 16px;
          padding: 20px;
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
          font-size: 28px;
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
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title-area">
          <h1>Expense Report</h1>
          <p>Monthly overview of all records</p>
        </div>
        <div class="meta-area">
          <div class="date">${monthName} ${year}</div>
          <div class="sub">Generated on ${new Date().toLocaleDateString()}</div>
        </div>
      </div>

      <div class="stats-container">
        <div class="stat-card">
          <div class="label">Total Spent</div>
          <div class="value primary">₹${totalSpent.toFixed(2)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Transactions</div>
          <div class="value">${expenses.length}</div>
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
          ${expenses.map(e => `
            <tr>
              <td>
                <div class="expense-title">${e.title}</div>
                ${e.description ? `<div class="expense-desc">${e.description}</div>` : ''}
              </td>
              <td><span class="tag tag-category">${e.category || 'Other'}</span></td>
              <td><span class="tag tag-method">${e.method || 'Cash'}</span></td>
              <td>${e.date}</td>
              <td class="amount-val">₹${e.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        Generated automatically by Expense Tracker Mobile App
      </div>
    </body>
    </html>
  `;

  try {
    // 1. Generate the raw PDF file
    const { uri: tempUri } = await Print.printToFileAsync({ html: htmlContent });
    
    // 2. Format a pristine filename
    const cleanFilename = `Expense_Report_${monthName}_${year}.pdf`.replace(/\s+/g, '_');
    const targetUri = `${FileSystem.documentDirectory}${cleanFilename}`;

    // 3. Move the file from temporary cache to a pristine document path
    await FileSystem.copyAsync({
      from: tempUri,
      to: targetUri
    });

    // 4. Trigger Native Save & Sharing popup with custom filename
    await Sharing.shareAsync(targetUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Download Expense Report - ${monthName} ${year}`,
      UTI: 'com.adobe.pdf'
    });

    return targetUri;
  } catch (error) {
    console.error("PDF generation/sharing failed", error);
    throw error;
  }
};
