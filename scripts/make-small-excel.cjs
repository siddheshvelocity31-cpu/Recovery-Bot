const ExcelJS = require('exceljs');
const path = require('path');

async function makeSmallExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ledger');

  ws.addRow(['CLIENT CODE:', 'DEMO-101', '', 'CLIENT NAME:', 'Apex Logistics Ltd']);
  ws.addRow(['PERIOD:', '01-Jan-2026 to 31-Aug-2026', '', '', '']);
  ws.addRow([]);

  ws.addRow(['Date', 'Doc Code', 'Type', 'Passenger', 'Narration', 'Reference', 'Amount']);
  ws.addRow(['2026-07-15', 'INV-5001', 'invoice', 'John Doe', 'Freight Services', 'REF-99', 150000]);
  ws.addRow(['2026-08-01', 'INV-5002', 'invoice', 'Jane Smith', 'Consulting Fee', 'REF-100', 250000]);
  ws.addRow(['2026-08-20', 'RCT-1001', 'receipt', 'John Doe', 'Part Payment Received', 'REF-99', -100000]);

  const filePath = path.join(__dirname, '..', 'public', 'Simple_Demo_Ledger.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log('SUCCESS! CREATED SMALL DEMO FILE:', filePath);
}

makeSmallExcel().catch(console.error);