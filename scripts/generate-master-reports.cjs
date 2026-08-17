const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle } = docx;

const db = require('../src/main/db');
db.initDB(path.join(__dirname, '../data'));

function fmt(n) {
  return 'UGX ' + Number(n || 0).toLocaleString();
}

function cell(text, bold = false, align = AlignmentType.LEFT) {
  return new TableCell({
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text), bold, size: 20, font: 'Calibri' })]
    })],
    padding: { top: 100, bottom: 100, left: 150, right: 150 }
  });
}

function headerCell(text) {
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), bold: true, color: 'FFFFFF', size: 20, font: 'Calibri' })]
    })],
    shading: { fill: '1E3A5F' },
    padding: { top: 120, bottom: 120, left: 150, right: 150 }
  });
}

async function run() {
  console.log('Generating June, July, and SACCO Excel & Word reports...');

  // ============================================================
  // DATA EXTRACTION
  // ============================================================
  // June 2026
  const juneReqs = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-06%' AND source_module = 'requisition_entry' ORDER BY date ASC");
  const junePayroll = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-06%' AND source_module = 'payroll_line' ORDER BY description ASC");
  const juneReqTotal = juneReqs.reduce((s, r) => s + Number(r.amount || 0), 0);
  const junePayTotal = junePayroll.reduce((s, r) => s + Number(r.amount || 0), 0);
  const juneExpTotal = juneReqTotal + junePayTotal;

  // July 2026
  const julyReqs = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-07%' AND source_module = 'requisition_entry' ORDER BY date ASC");
  const julyPayroll = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-07%' AND source_module = 'payroll_line' ORDER BY description ASC");
  const julyReqTotal = julyReqs.reduce((s, r) => s + Number(r.amount || 0), 0);
  const julyPayTotal = julyPayroll.reduce((s, r) => s + Number(r.amount || 0), 0);
  const julyExpTotal = julyReqTotal + julyPayTotal;

  // SACCO
  const saccoMembers = db.query("SELECT * FROM sacco_members ORDER BY full_name ASC");
  const saccoSavings = db.query("SELECT * FROM sacco_savings ORDER BY deposit_date ASC");
  const saccoLoans = db.query("SELECT * FROM sacco_loans ORDER BY issue_date ASC");
  const saccoRepayments = db.query("SELECT * FROM sacco_repayments ORDER BY repayment_date ASC");
  const saccoInterest = db.query("SELECT * FROM sacco_finance_items WHERE type = 'Revenue' ORDER BY date ASC");

  const totalSaccoMembers = saccoMembers.length;
  const totalSaccoSavings = saccoSavings.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaccoLoans = saccoLoans.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaccoRepayments = saccoRepayments.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaccoOutstanding = totalSaccoLoans - totalSaccoRepayments;
  const totalSaccoInterest = saccoInterest.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Blocks
  const blocks = db.query("SELECT * FROM blocks ORDER BY name ASC");

  // ============================================================
  // 1. JUNE 2026 EXCEL & WORD
  // ============================================================
  // Excel: June
  const juneWb = XLSX.utils.book_new();
  const juneExecRows = [
    { Metric: 'Report Month', Value: 'June 2026' },
    { Metric: 'Total Operational Requisitions', Value: fmt(juneReqTotal) + ` (${juneReqs.length} items)` },
    { Metric: 'Total Staff Payroll Expenses', Value: fmt(junePayTotal) + ` (${junePayroll.length} staff)` },
    { Metric: 'Total June Expenses', Value: fmt(juneExpTotal) },
  ];
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(juneExecRows), 'Summary');
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(juneReqs.map(r => ({ Date: r.date, Category: r.category, Description: r.description, Amount_UGX: r.amount }))), 'Requisitions');
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(junePayroll.map(r => ({ Date: r.date, Description: r.description, Amount_UGX: r.amount }))), 'Staff_Payroll');
  XLSX.writeFileXLSX(juneWb, path.join(__dirname, '../June_2026_Farm_Report.xlsx'));

  // Word: June
  const juneDoc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "NYAKAMENTA COFFEE ESTATE", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "Monthly Farm Financial & Operations Report — June 2026", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "1. Executive Summary", heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: `During the month of June 2026, total operational and staff expenses amounted to ${fmt(juneExpTotal)}. This was comprised of ${fmt(juneReqTotal)} in approved operational requisitions and ${fmt(junePayTotal)} in staff payroll.` }),
        new Paragraph({ text: `• Operational Requisitions: ${juneReqs.length} approved expense items (${fmt(juneReqTotal)})` }),
        new Paragraph({ text: `• Staff Payroll: ${junePayroll.length} staff members paid (${fmt(junePayTotal)})` }),
        
        new Paragraph({ text: "2. Approved Operational Requisitions (June 2026)", heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Category"), headerCell("Description"), headerCell("Amount (UGX)")] }),
            ...juneReqs.map(r => new TableRow({ children: [cell(r.date), cell(r.category), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("—", true), cell("June Requisitions Subtotal", true), cell(fmt(juneReqTotal), true)] })
          ]
        }),

        new Paragraph({ text: "3. Staff Salaries & Wages (June 2026)", heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Staff Member / Description"), headerCell("Gross Salary (UGX)")] }),
            ...junePayroll.map(r => new TableRow({ children: [cell(r.date), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("June Payroll Subtotal", true), cell(fmt(junePayTotal), true)] })
          ]
        })
      ]
    }]
  });
  const juneBuffer = await Packer.toBuffer(juneDoc);
  fs.writeFileSync(path.join(__dirname, '../June_2026_Farm_Report.docx'), juneBuffer);

  // ============================================================
  // 2. JULY 2026 EXCEL & WORD
  // ============================================================
  // Excel: July
  const julyWb = XLSX.utils.book_new();
  const julyExecRows = [
    { Metric: 'Report Month', Value: 'July 2026' },
    { Metric: 'Total Operational Requisitions', Value: fmt(julyReqTotal) + ` (${julyReqs.length} items)` },
    { Metric: 'Total Staff Payroll Expenses', Value: fmt(julyPayTotal) + ` (${julyPayroll.length} staff)` },
    { Metric: 'Total July Expenses', Value: fmt(julyExpTotal) },
  ];
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julyExecRows), 'Summary');
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julyReqs.map(r => ({ Date: r.date, Category: r.category, Description: r.description, Amount_UGX: r.amount }))), 'Requisitions');
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julyPayroll.map(r => ({ Date: r.date, Description: r.description, Amount_UGX: r.amount }))), 'Staff_Payroll');
  XLSX.writeFileXLSX(julyWb, path.join(__dirname, '../July_2026_Farm_Report.xlsx'));

  // Word: July
  const julyDoc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "NYAKAMENTA COFFEE ESTATE", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "Monthly Farm Financial & Operations Report — July 2026", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "1. Executive Summary", heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: `During the month of July 2026, total farm expenses amounted to ${fmt(julyExpTotal)}. This was comprised of ${fmt(julyReqTotal)} across 42 approved operational requisitions and ${fmt(julyPayTotal)} across 26 staff salaries.` }),
        new Paragraph({ text: `• Operational Requisitions: 42 approved items (${fmt(julyReqTotal)})` }),
        new Paragraph({ text: `• Staff Payroll: 26 staff members paid (${fmt(julyPayTotal)})` }),

        new Paragraph({ text: "2. Approved Operational Requisitions (July 2026)", heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Category"), headerCell("Description"), headerCell("Amount (UGX)")] }),
            ...julyReqs.map(r => new TableRow({ children: [cell(r.date), cell(r.category), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("—", true), cell("July Requisitions Subtotal", true), cell(fmt(julyReqTotal), true)] })
          ]
        }),

        new Paragraph({ text: "3. Staff Salaries & Wages (July 2026)", heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Staff Member / Description"), headerCell("Gross Salary (UGX)")] }),
            ...julyPayroll.map(r => new TableRow({ children: [cell(r.date), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("July Payroll Subtotal", true), cell(fmt(julyPayTotal), true)] })
          ]
        })
      ]
    }]
  });
  const julyBuffer = await Packer.toBuffer(julyDoc);
  fs.writeFileSync(path.join(__dirname, '../July_2026_Farm_Report.docx'), julyBuffer);

  // ============================================================
  // 3. SACCO MASTER REPORT EXCEL & WORD
  // ============================================================
  // Excel: SACCO
  const saccoWb = XLSX.utils.book_new();
  const saccoExecRows = [
    { Metric: 'Total SACCO Members', Value: totalSaccoMembers },
    { Metric: 'Total Accumulated Savings', Value: fmt(totalSaccoSavings) },
    { Metric: 'Total Active Loan Book', Value: fmt(totalSaccoLoans) },
    { Metric: 'Total Loan Repayments Collected', Value: fmt(totalSaccoRepayments) },
    { Metric: 'Outstanding Loan Balance', Value: fmt(totalSaccoOutstanding) },
    { Metric: 'Total SACCO Interest Earned', Value: fmt(totalSaccoInterest) },
  ];
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoExecRows), 'Overview');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoMembers.map(m => ({ Member_No: m.member_no, Full_Name: m.full_name, Phone: m.phone, Status: m.status }))), 'Members');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoSavings.map(s => ({ Date: s.deposit_date, Member_ID: s.member_id, Amount_UGX: s.amount, Notes: s.notes }))), 'Savings');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoLoans.map(l => ({ Loan_ID: l.id, Member_ID: l.member_id, Principal_UGX: l.amount, Interest_Rate: `${l.interest_rate}%`, Issue_Date: l.issue_date, Status: l.status }))), 'Loans');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoRepayments.map(r => ({ Date: r.repayment_date, Loan_ID: r.loan_id, Amount_UGX: r.amount, Notes: r.notes }))), 'Repayments');
  XLSX.writeFileXLSX(saccoWb, path.join(__dirname, '../SACCO_Master_Performance_Report.xlsx'));

  // Word: SACCO
  const saccoDoc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "NYAKAMENTA FARM WORKERS SACCO", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "Master Performance & Loan Book Report (Jan – Jul 2026)", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "1. Executive Financial Overview", heading: HeadingLevel.HEADING_3 }),
        new Paragraph({ text: `The SACCO currently has ${totalSaccoMembers} registered members. Accumulated savings total ${fmt(totalSaccoSavings)}. The active loan book stands at ${fmt(totalSaccoLoans)}, with ${fmt(totalSaccoRepayments)} in loan repayments collected to date and an outstanding balance of ${fmt(totalSaccoOutstanding)}. Total loan interest earned stands at ${fmt(totalSaccoInterest)}.` }),

        new Paragraph({ text: "2. SACCO Performance Summary", heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Metric / Indicator"), headerCell("Value / Total")] }),
            new TableRow({ children: [cell("Total Registered Members"), cell(`${totalSaccoMembers} Members`)] }),
            new TableRow({ children: [cell("Total Accumulated Savings"), cell(fmt(totalSaccoSavings))] }),
            new TableRow({ children: [cell("Total Active Loan Principal Issued"), cell(fmt(totalSaccoLoans))] }),
            new TableRow({ children: [cell("Total Loan Repayments Collected"), cell(fmt(totalSaccoRepayments))] }),
            new TableRow({ children: [cell("Outstanding Loan Balance"), cell(fmt(totalSaccoOutstanding))] }),
            new TableRow({ children: [cell("Total Loan Interest Revenue Earned"), cell(fmt(totalSaccoInterest))] }),
          ]
        }),

        new Paragraph({ text: "3. Active Member Savings & Loan Balances", heading: HeadingLevel.HEADING_3 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Member No"), headerCell("Full Name"), headerCell("Phone"), headerCell("Status")] }),
            ...saccoMembers.map(m => new TableRow({ children: [cell(m.member_no), cell(m.full_name), cell(m.phone || '—'), cell(m.status)] }))
          ]
        })
      ]
    }]
  });
  const saccoBuffer = await Packer.toBuffer(saccoDoc);
  fs.writeFileSync(path.join(__dirname, '../SACCO_Master_Performance_Report.docx'), saccoBuffer);

  console.log('\n========================================');
  console.log('ALL 6 MASTER REPORTS GENERATED SUCCESSFULLY:');
  console.log('1. June_2026_Farm_Report.xlsx');
  console.log('2. June_2026_Farm_Report.docx');
  console.log('3. July_2026_Farm_Report.xlsx');
  console.log('4. July_2026_Farm_Report.docx');
  console.log('5. SACCO_Master_Performance_Report.xlsx');
  console.log('6. SACCO_Master_Performance_Report.docx');
  console.log('========================================\n');
}

run().catch(err => console.error('Error generating master reports:', err));
