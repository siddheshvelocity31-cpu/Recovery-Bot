const ExcelJS = require('exceljs');
const path = require('path');

async function makeOverdueExcel() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ledger');

  ws.addRow(['CLIENT CODE:', 'OGL-909', '', 'CLIENT NAME:', 'Olectra Greentech Ltd']);
  ws.addRow(['PERIOD:', '01-May-2026 to 31-Aug-2026', '', '', '']);
  ws.addRow([]);

  ws.addRow(['Date', 'Doc Code', 'Type', 'Passenger', 'Narration', 'Reference', 'Amount']);
  ws.addRow(['2026-05-10', 'INV-8001', 'invoice', 'Rajesh Kumar', 'EV Bus Maintenance & Parts', 'REF-801', 250000]);
  ws.addRow(['2026-06-15', 'INV-8002', 'invoice', 'Priya Sharma', 'Fleet Telematics Subscription', 'REF-802', 180000]);
  ws.addRow(['2026-07-20', 'RCT-4001', 'receipt', 'Rajesh Kumar', 'Advance Part Payment', 'REF-801', -50000]);

  const filePath = path.join(__dirname, '..', 'public', 'Simple_Demo_Ledger.xlsx');
  await wb.xlsx.writeFile(filePath);
  console.log('SUCCESS! CREATED OVERDUE DEMO FILE:', filePath);
}

makeOverdueExcel().catch(console.error);