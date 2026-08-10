const text = `
r117 Профсоюзные взносы 1 4,598.37
r117 Профсоюзные взносы 2 11,308.03
r117 Профсоюзные взносы 1 500.00
r117 Профсоюзные взносы 1500.00
r117 Профсоюзные взносы 1 1 500.00
`;

const sumRegex = /Профсоюз[\s\S]{1,50}?([\d\s,]+[\.,]\d{2})/gi;
let match;
while ((match = sumRegex.exec(text)) !== null) {
  let raw = match[1].trim();
  const parts = raw.split(/\s+/);
  const clean = parts[parts.length - 1].replace(/,/g, '');
  console.log("Matched:", raw, "=>", clean);
}
