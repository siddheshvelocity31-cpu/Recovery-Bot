const ExcelJS = require('exceljs');
const path = require('path');

async function makeCorporateClientExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ledger');

  ws.addRow(['CLIENT CODE:', 'CLIENT_01', '', 'CLIENT NAME:', 'Corporate Client']);
  ws.addRow(['PERIOD:', '01-May-2026 to 31-Aug-2026', '', '', '']);
  ws.addRow([]);

  ws.addRow(['Date', 'Doc Code', 'Type', 'Passenger', 'Narration', 'Reference', 'Amount']);
  ws.addRow(['2026-06-10', 'INV-9001', 'invoice', 'Corporate User', 'Corporate Travel & Part Billing', 'REF-901', 350000]);
  ws.addRow(['2026-07-15', 'INV-9002', 'invoice', 'Executive User', 'Monthly Retainer Charge', 'REF-902', 200000]);
  ws.addRow(['2026-08-01', 'RCT-5001', 'receipt', 'Corporate User', 'Partial Bank Transfer', 'REF-901', -100000]);

  const filePath = path.join(__dirname, '..', 'public', 'Simple_Demo_Ledger.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log('SUCCESS! CREATED CORPORATE CLIENT DEMO FILE:', filePath);
}

makeCorporateClientExcel().catch(console.error);