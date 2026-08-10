const fs = require('fs');
const xlsx = require('xlsx');

// Extract names text from parse_may.js
const parseMayJs = fs.readFileSync('/Users/zakir/union-app/scratch/parse_may.js', 'utf8');
const namesTextMatch = parseMayJs.match(/const text = `([\s\S]*?)`;/);
const namesText = namesTextMatch ? namesTextMatch[1] : '';

// Extract sums text from parse_sums.js
const parseSumsJs = fs.readFileSync('/Users/zakir/union-app/scratch/parse_sums.js', 'utf8');
const sumsTextMatch = parseSumsJs.match(/const text = `([\s\S]*?)`;/);
const sumsText = sumsTextMatch ? sumsTextMatch[1] : '';

const nameRegex = /^([А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+(?:\s+[А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+){1,2})$/;

const names = [];
for (const line of namesText.split('\n')) {
   const m = line.match(/31\.05\.2026\d*\s+\d+\s+\d+\s+([А-Я][а-яА-Я\s\-]+)\s+\d{12}/);
   if (m) {
     names.push(m[1].trim());
   } else {
     // fallback
     const m2 = line.match(/\d{12}/);
     if (m2) {
       // try to extract name
       const parts = line.split(/\s+/);
       let nameParts = [];
       for (const p of parts) {
         if (/^[А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+$/.test(p)) {
           if (!p.includes('Профсоюз')) nameParts.push(p);
         }
       }
       if (nameParts.length >= 2) names.push(nameParts.join(' '));
     }
   }
}

const sums = [];
const sumRegex = /(?:r|e)117\s+Профсоюз[^\d]*?\s+\d+\s+([\d,]+[\.,]\d{2})/i;
for (const line of sumsText.split('\n')) {
   const m = line.match(sumRegex);
   if (m) {
      sums.push(m[1].replace(/,/g, ''));
   }
}

console.log("Names:", names.length, "Sums:", sums.length);

if (names.length > 0 && sums.length > 0) {
  const minLen = Math.min(names.length, sums.length);
  const data = [];
  data.push(['ФИО', 'Сумма взноса']); // Header
  for (let i = 0; i < minLen; i++) {
     data.push([names[i], parseFloat(sums[i])]);
  }
  
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(data);
  
  // Auto-fit columns
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }];
  
  xlsx.utils.book_append_sheet(wb, ws, "Май");
  xlsx.writeFile(wb, '/Users/zakir/union-app/public/may_dues.xlsx');
  console.log("Generated public/may_dues.xlsx successfully");
} else {
  console.log("Error: could not extract names or sums properly.");
}
