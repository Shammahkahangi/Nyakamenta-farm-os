const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const docx = require('docx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, PageOrientation } = docx;

const db = require('../src/main/db');
db.initDB(path.join(__dirname, '../data'));

function fmt(n) {
  return 'UGX ' + Number(n || 0).toLocaleString();
}

function safeWriteFile(filePath, buffer) {
  try {
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (err) {
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const altPath = path.join(path.dirname(filePath), `${base}_Updated${ext}`);
    fs.writeFileSync(altPath, buffer);
    return altPath;
  }
}

function cell(text, bold = false, align = AlignmentType.LEFT) {
  return new TableCell({
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text), bold, size: 18, font: 'Book Antiqua' })]
    })],
    padding: { top: 80, bottom: 80, left: 100, right: 100 }
  });
}

function headerCell(text) {
  return new TableCell({
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: String(text), bold: true, color: 'FFFFFF', size: 18, font: 'Book Antiqua' })]
    })],
    shading: { fill: '1E3A5F' },
    padding: { top: 100, bottom: 100, left: 100, right: 100 }
  });
}

function heading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true, font: 'Book Antiqua' })],
    spacing: { before: 200, after: 100 }
  });
}

function pText(text, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text, bold, font: 'Book Antiqua', size: 20 })],
    spacing: { before: 60, after: 60 }
  });
}

async function run() {
  console.log('Generating Book Antiqua Word & Excel reports with SACCO activity...');

  // DATA EXTRACTION
  // June
  const juneReqs = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-06%' AND source_module = 'requisition_entry' ORDER BY date ASC");
  const junePayroll = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-06%' AND source_module = 'payroll_line' ORDER BY description ASC");
  const juneReqTotal = juneReqs.reduce((s, r) => s + Number(r.amount || 0), 0);
  const junePayTotal = junePayroll.reduce((s, r) => s + Number(r.amount || 0), 0);
  const juneExpTotal = juneReqTotal + junePayTotal;

  const juneSaccoSavings = db.query("SELECT s.*, m.full_name FROM sacco_savings s LEFT JOIN sacco_members m ON s.member_id = m.id WHERE deposit_date LIKE '2026-06%' ORDER BY deposit_date ASC");
  const juneSaccoRepay = db.query("SELECT r.*, l.member_id, m.full_name FROM sacco_repayments r LEFT JOIN sacco_loans l ON r.loan_id = l.id LEFT JOIN sacco_members m ON l.member_id = m.id WHERE r.repayment_date LIKE '2026-06%' ORDER BY repayment_date ASC");
  const juneSaccoSavTotal = juneSaccoSavings.reduce((s, r) => s + Number(r.amount || 0), 0);
  const juneSaccoRepTotal = juneSaccoRepay.reduce((s, r) => s + Number(r.amount || 0), 0);

  // July
  const julyReqs = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-07%' AND source_module = 'requisition_entry' ORDER BY date ASC");
  const julyPayroll = db.query("SELECT * FROM finance_items WHERE date LIKE '2026-07%' AND source_module = 'payroll_line' ORDER BY description ASC");
  const julyReqTotal = julyReqs.reduce((s, r) => s + Number(r.amount || 0), 0);
  const julyPayTotal = julyPayroll.reduce((s, r) => s + Number(r.amount || 0), 0);
  const julyExpTotal = julyReqTotal + julyPayTotal;

  const julySaccoSavings = db.query("SELECT s.*, m.full_name FROM sacco_savings s LEFT JOIN sacco_members m ON s.member_id = m.id WHERE deposit_date LIKE '2026-07%' ORDER BY deposit_date ASC");
  const julySaccoRepay = db.query("SELECT r.*, l.member_id, m.full_name FROM sacco_repayments r LEFT JOIN sacco_loans l ON r.loan_id = l.id LEFT JOIN sacco_members m ON l.member_id = m.id WHERE r.repayment_date LIKE '2026-07%' ORDER BY repayment_date ASC");
  const julySaccoSavTotal = julySaccoSavings.reduce((s, r) => s + Number(r.amount || 0), 0);
  const julySaccoRepTotal = julySaccoRepay.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Master SACCO
  const saccoMembers = db.query("SELECT * FROM sacco_members ORDER BY full_name ASC");
  const saccoSavings = db.query("SELECT s.*, m.full_name FROM sacco_savings s LEFT JOIN sacco_members m ON s.member_id = m.id ORDER BY deposit_date ASC");
  const saccoLoans = db.query("SELECT l.*, m.full_name FROM sacco_loans l LEFT JOIN sacco_members m ON l.member_id = m.id ORDER BY l.id ASC");
  const saccoRepayments = db.query("SELECT r.*, l.member_id, m.full_name FROM sacco_repayments r LEFT JOIN sacco_loans l ON r.loan_id = l.id LEFT JOIN sacco_members m ON l.member_id = m.id ORDER BY repayment_date ASC");

  const totalSaccoMembers = saccoMembers.length;
  const totalSaccoSavings = saccoSavings.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaccoLoans = saccoLoans.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaccoRepayments = saccoRepayments.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalSaccoOutstanding = Math.max(totalSaccoLoans - totalSaccoRepayments, 0);

  // ============================================================
  // 1. JUNE 2026 REPORT
  // ============================================================
  // Excel: June
  const juneWb = XLSX.utils.book_new();
  const juneExecRows = [
    { Metric: 'Report Month', Value: 'June 2026' },
    { Metric: 'Total Operational Requisitions', Value: fmt(juneReqTotal) + ` (${juneReqs.length} items)` },
    { Metric: 'Total Staff Payroll Expenses', Value: fmt(junePayTotal) + ` (${junePayroll.length} staff)` },
    { Metric: 'Total June Farm Expenses', Value: fmt(juneExpTotal) },
    { Metric: 'June SACCO Savings Deposits', Value: fmt(juneSaccoSavTotal) },
    { Metric: 'June SACCO Loan Repayments Collected', Value: fmt(juneSaccoRepTotal) },
  ];
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(juneExecRows), 'Summary');
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(juneReqs.map(r => ({ Date: r.date, Category: r.category, Description: r.description, Amount_UGX: r.amount }))), 'Requisitions');
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(junePayroll.map(r => ({ Date: r.date, Description: r.description, Amount_UGX: r.amount }))), 'Staff_Payroll');
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(juneSaccoSavings.map(s => ({ Date: s.deposit_date, Member: s.full_name, Amount_UGX: s.amount }))), 'SACCO_Savings');
  XLSX.utils.book_append_sheet(juneWb, XLSX.utils.json_to_sheet(juneSaccoRepay.map(r => ({ Date: r.repayment_date, Member: r.full_name, Loan_ID: r.loan_id, Amount_UGX: r.amount }))), 'SACCO_Repayments');
  XLSX.writeFileXLSX(juneWb, path.join(__dirname, '../June_2026_Farm_Report.xlsx'));

  // Word: June
  const juneDoc = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        new Paragraph({ text: "NYAKAMENTA COFFEE ESTATE", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "Monthly Farm Financial, Operations & SACCO Report — June 2026", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        heading("1. Executive Summary", HeadingLevel.HEADING_3),
        pText(`During June 2026, total farm expenses amounted to ${fmt(juneExpTotal)}. Operational requisitions were ${fmt(juneReqTotal)} across 24 approved items, and staff salaries were ${fmt(junePayTotal)}. On the SACCO side, members contributed ${fmt(juneSaccoSavTotal)} in savings, and ${fmt(juneSaccoRepTotal)} was collected in loan repayments.`),
        
        heading("2. Approved Operational Requisitions (June 2026)", HeadingLevel.HEADING_3),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Category"), headerCell("Description"), headerCell("Amount (UGX)")] }),
            ...juneReqs.map(r => new TableRow({ children: [cell(r.date), cell(r.category), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("—", true), cell("June Requisitions Subtotal", true), cell(fmt(juneReqTotal), true)] })
          ]
        }),

        heading("3. Staff Salaries & Payroll (June 2026)", HeadingLevel.HEADING_3),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Staff Member / Description"), headerCell("Gross Salary (UGX)")] }),
            ...junePayroll.map(r => new TableRow({ children: [cell(r.date), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("June Payroll Subtotal", true), cell(fmt(junePayTotal), true)] })
          ]
        }),

        heading("4. SACCO Activity & Member Contributions (June 2026)", HeadingLevel.HEADING_3),
        pText(`• June SACCO Member Savings Deposits: ${fmt(juneSaccoSavTotal)} (${juneSaccoSavings.length} members)`),
        pText(`• June SACCO Loan Repayments Collected: ${fmt(juneSaccoRepTotal)} (${juneSaccoRepay.length} repayments)`),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Member Name"), headerCell("Activity Type"), headerCell("Amount (UGX)")] }),
            ...juneSaccoSavings.map(s => new TableRow({ children: [cell(s.deposit_date), cell(s.full_name || 'Member'), cell("Savings Deposit"), cell(fmt(s.amount))] })),
            ...juneSaccoRepay.map(r => new TableRow({ children: [cell(r.repayment_date), cell(r.full_name || 'Member'), cell(`Loan Repayment (#${r.loan_id})`), cell(fmt(r.amount))] }))
          ]
        })
      ]
    }]
  });
  const juneOut = safeWriteFile(path.join(__dirname, '../June_2026_Farm_Report.docx'), await Packer.toBuffer(juneDoc));
  console.log(`June Word report written: ${path.basename(juneOut)}`);

  // ============================================================
  // 2. JULY 2026 REPORT
  // ============================================================
  // Excel: July
  const julyWb = XLSX.utils.book_new();
  const julyExecRows = [
    { Metric: 'Report Month', Value: 'July 2026' },
    { Metric: 'Total Operational Requisitions', Value: fmt(julyReqTotal) + ` (${julyReqs.length} items)` },
    { Metric: 'Total Staff Payroll Expenses', Value: fmt(julyPayTotal) + ` (${julyPayroll.length} staff)` },
    { Metric: 'Total July Farm Expenses', Value: fmt(julyExpTotal) },
    { Metric: 'July SACCO Savings Deposits', Value: fmt(julySaccoSavTotal) },
    { Metric: 'July SACCO Loan Repayments Collected', Value: fmt(julySaccoRepTotal) },
  ];
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julyExecRows), 'Summary');
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julyReqs.map(r => ({ Date: r.date, Category: r.category, Description: r.description, Amount_UGX: r.amount }))), 'Requisitions');
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julyPayroll.map(r => ({ Date: r.date, Description: r.description, Amount_UGX: r.amount }))), 'Staff_Payroll');
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julySaccoSavings.map(s => ({ Date: s.deposit_date, Member: s.full_name, Amount_UGX: s.amount }))), 'SACCO_Savings');
  XLSX.utils.book_append_sheet(julyWb, XLSX.utils.json_to_sheet(julySaccoRepay.map(r => ({ Date: r.repayment_date, Member: r.full_name, Loan_ID: r.loan_id, Amount_UGX: r.amount }))), 'SACCO_Repayments');
  XLSX.writeFileXLSX(julyWb, path.join(__dirname, '../July_2026_Farm_Report.xlsx'));

  // Word: July
  const julyDoc = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        new Paragraph({ text: "NYAKAMENTA COFFEE ESTATE", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "Monthly Farm Financial, Operations & SACCO Report — July 2026", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        heading("1. Executive Summary", HeadingLevel.HEADING_3),
        pText(`During July 2026, total farm expenses amounted to ${fmt(julyExpTotal)}. This was comprised of ${fmt(julyReqTotal)} across 42 approved operational requisitions and ${fmt(julyPayTotal)} across 26 staff salaries. On the SACCO side, members saved ${fmt(julySaccoSavTotal)} and made ${fmt(julySaccoRepTotal)} in loan repayments.`),

        heading("2. Approved Operational Requisitions (July 2026)", HeadingLevel.HEADING_3),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Category"), headerCell("Description"), headerCell("Amount (UGX)")] }),
            ...julyReqs.map(r => new TableRow({ children: [cell(r.date), cell(r.category), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("—", true), cell("July Requisitions Subtotal", true), cell(fmt(julyReqTotal), true)] })
          ]
        }),

        heading("3. Staff Salaries & Payroll (July 2026)", HeadingLevel.HEADING_3),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Staff Member / Description"), headerCell("Gross Salary (UGX)")] }),
            ...julyPayroll.map(r => new TableRow({ children: [cell(r.date), cell(r.description), cell(fmt(r.amount))] })),
            new TableRow({ children: [cell("Total", true), cell("July Payroll Subtotal", true), cell(fmt(julyPayTotal), true)] })
          ]
        }),

        heading("4. SACCO Activity & Member Contributions (July 2026)", HeadingLevel.HEADING_3),
        pText(`• July SACCO Member Savings Deposits: ${fmt(julySaccoSavTotal)} (${julySaccoSavings.length} members)`),
        pText(`• July SACCO Loan Repayments Collected: ${fmt(julySaccoRepTotal)} (${julySaccoRepay.length} repayments)`),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Date"), headerCell("Member Name"), headerCell("Activity Type"), headerCell("Amount (UGX)")] }),
            ...julySaccoSavings.map(s => new TableRow({ children: [cell(s.deposit_date), cell(s.full_name || 'Member'), cell("Savings Deposit"), cell(fmt(s.amount))] })),
            ...julySaccoRepay.map(r => new TableRow({ children: [cell(r.repayment_date), cell(r.full_name || 'Member'), cell(`Loan Repayment (#${r.loan_id})`), cell(fmt(r.amount))] }))
          ]
        })
      ]
    }]
  });
  const julyOut = safeWriteFile(path.join(__dirname, '../July_2026_Farm_Report.docx'), await Packer.toBuffer(julyDoc));
  console.log(`July Word report written: ${path.basename(julyOut)}`);

  // ============================================================
  // 3. SACCO MASTER REPORT
  // ============================================================
  // Excel: SACCO
  const saccoWb = XLSX.utils.book_new();
  const saccoExecRows = [
    { Metric: 'Total SACCO Members', Value: totalSaccoMembers },
    { Metric: 'Total Accumulated Savings', Value: fmt(totalSaccoSavings) },
    { Metric: 'Total Active Loan Principal', Value: fmt(totalSaccoLoans) },
    { Metric: 'Total Loan Repayments Collected', Value: fmt(totalSaccoRepayments) },
    { Metric: 'Outstanding Loan Balance', Value: fmt(totalSaccoOutstanding) },
  ];
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoExecRows), 'Overview');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoMembers.map(m => ({ Member_No: m.member_no, Full_Name: m.full_name, Phone: m.phone, Status: m.status }))), 'Members');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoSavings.map(s => ({ Date: s.deposit_date, Member: s.full_name, Amount_UGX: s.amount, Notes: s.notes }))), 'Savings');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoLoans.map(l => ({ Loan_ID: l.id, Member: l.full_name, Principal_UGX: l.amount, Interest_Rate: `${l.interest_rate}%`, Issue_Date: l.issue_date, Status: l.status }))), 'Loans');
  XLSX.utils.book_append_sheet(saccoWb, XLSX.utils.json_to_sheet(saccoRepayments.map(r => ({ Date: r.repayment_date, Member: r.full_name, Loan_ID: r.loan_id, Amount_UGX: r.amount, Notes: r.notes }))), 'Repayments');
  XLSX.writeFileXLSX(saccoWb, path.join(__dirname, '../SACCO_Master_Performance_Report.xlsx'));

  // Word: SACCO Master Report
  const saccoDoc = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        new Paragraph({ text: "NYAKAMENTA FARM WORKERS SACCO", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "Master Performance & Loan Book Report (Jan – Jul 2026)", heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
        heading("1. Executive Overview", HeadingLevel.HEADING_3),
        pText(`The SACCO has ${totalSaccoMembers} registered members with total accumulated savings of ${fmt(totalSaccoSavings)}. Total loans issued stand at ${fmt(totalSaccoLoans)}, with ${fmt(totalSaccoRepayments)} in loan repayments collected to date and an outstanding balance of ${fmt(totalSaccoOutstanding)} across all active accounts.`),

        heading("2. Loan Book & Repayment Status", HeadingLevel.HEADING_3),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [headerCell("Loan ID"), headerCell("Member Name"), headerCell("Principal Issued"), headerCell("Repayment Status"), headerCell("Current Status")] }),
            ...saccoLoans.map(l => {
              const reps = saccoRepayments.filter(r => r.loan_id === l.id).reduce((s, r) => s + Number(r.amount || 0), 0);
              const bal = Math.max(Number(l.amount || 0) - reps, 0);
              const st = bal <= 0 ? 'Paid' : (l.status || 'Active');
              return new TableRow({ children: [cell(`#${l.id}`), cell(l.full_name || 'Member'), cell(fmt(l.amount)), cell(`Paid ${fmt(reps)} (Bal ${fmt(bal)})`), cell(st, st === 'Paid')] });
            })
          ]
        }),

        heading("3. Registered SACCO Members", HeadingLevel.HEADING_3),
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
  const saccoOut = safeWriteFile(path.join(__dirname, '../SACCO_Master_Performance_Report.docx'), await Packer.toBuffer(saccoDoc));
  console.log(`SACCO Word report written: ${path.basename(saccoOut)}`);

  console.log('\n========================================');
  console.log('MASTER REPORTS REGENERATED WITH BOOK ANTIQUA & SACCO ACTIVITY:');
  console.log('1. June_2026_Farm_Report.docx & .xlsx');
  console.log('2. July_2026_Farm_Report.docx & .xlsx');
  console.log('3. SACCO_Master_Performance_Report.docx & .xlsx');
  console.log('========================================\n');
}

run().catch(err => console.error('Error generating master reports:', err));
