// Helper to convert data.js to data.json for migration
import { DB } from './data.js';
import fs from 'fs';

fs.writeFileSync('./data.json', JSON.stringify(DB, null, 2));
console.log('data.json created');
