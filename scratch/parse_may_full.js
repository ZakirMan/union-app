const fs = require('fs');
const text = fs.readFileSync('/Users/zakir/union-app/scratch/may_ocr.txt', 'utf8');

const nameRegex = /^([А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+(?:\s+[А-ЯӨҚӘҮҰҒІҢA-Z][a-zA-ZА-Яа-яЁёӨөҚқӘәҮүҰұҒғІіҢң\-]+){1,2})$/;

const names = [];
for (const line of text.split('\n')) {
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
for (const line of text.split('\n')) {
   const m = line.match(sumRegex);
   if (m) {
      sums.push(m[1].replace(/,/g, ''));
   }
}

console.log("Names:", names.length, "Sums:", sums.length);
if (names.length === sums.length) {
   let output = "ФИО\tСумма взноса\n";
   for (let i = 0; i < names.length; i++) {
      output += `${names[i]}\t${sums[i]}\n`;
   }
   fs.writeFileSync('/Users/zakir/union-app/public/may_dues.txt', output);
   console.log("Generated public/may_dues.txt");
}
