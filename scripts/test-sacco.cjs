const path = require('path');
const db = require('../src/main/db');
db.initDB(path.join(__dirname, '../data'));

const members = db.query('SELECT COUNT(*) as c FROM sacco_members');
const savings = db.query('SELECT SUM(amount) as s FROM sacco_savings');
const loans = db.query('SELECT SUM(amount) as l FROM sacco_loans');
const repayments = db.query('SELECT SUM(amount) as r FROM sacco_repayments');
const rev = db.query("SELECT SUM(amount) as rev FROM sacco_finance_items WHERE type = 'Revenue'");

console.log('--- SACCO DATABASE AUDIT ---');
console.log('Members Count       :', members[0].c);
console.log('Total Savings       : UGX', Number(savings[0].s || 0).toLocaleString());
console.log('Total Loan Book     : UGX', Number(loans[0].l || 0).toLocaleString());
console.log('Total Repayments    : UGX', Number(repayments[0].r || 0).toLocaleString());
console.log('Outstanding Balance : UGX', Number((loans[0].l || 0) - (repayments[0].r || 0)).toLocaleString());
console.log('Interest Revenue    : UGX', Number(rev[0].rev || 0).toLocaleString());
