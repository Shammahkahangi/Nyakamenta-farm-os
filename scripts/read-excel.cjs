const XLSX = require('xlsx');

const workbook = XLSX.readFile('d:\\Loan-softwares\\Coffee management system\\requisition 1.xlsx');
const sheetNames = workbook.SheetNames;
console.log("Sheet names:", sheetNames);

for (const sheetName of sheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    // Print the first 5 rows to understand the structure
    console.log("First 5 rows:");
    console.log(JSON.stringify(data.slice(0, 5), null, 2));
}
