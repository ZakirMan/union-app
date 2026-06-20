function parseAmount(amountStr) {
    let str = amountStr.replace(/\s+/g, '').replace(/[^\d.,-]/g, '');
    const lastDot = str.lastIndexOf('.');
    const lastComma = str.lastIndexOf(',');
    const sepIdx = Math.max(lastDot, lastComma);
    
    if (sepIdx !== -1) {
        const hasBoth = lastDot !== -1 && lastComma !== -1;
        if (hasBoth) {
            if (lastDot > lastComma) {
                str = str.replace(/,/g, '');
            } else {
                str = str.replace(/\./g, '').replace(',', '.');
            }
        } else {
            if (str.length - sepIdx - 1 === 2) {
                str = str.substring(0, sepIdx).replace(/[.,]/g, '') + '.' + str.substring(sepIdx + 1);
            } else if (str.length - sepIdx - 1 === 3) {
                str = str.replace(/[.,]/g, '');
            } else {
                str = str.substring(0, sepIdx).replace(/[.,]/g, '') + '.' + str.substring(sepIdx + 1);
            }
        }
    }
    return parseFloat(str);
}

const tests = [
    "3,331.36",
    "3.331,36",
    "3 331,36",
    "3 331.36",
    "3331,36",
    "3331.36",
    "1,551,157.19",
    "1.551.157,19",
    "1 551 157",
    "1,551,157",
    "1.551.157",
    "3,331",
    "574.62",
    "16 142 431"
];

for (const t of tests) {
    console.log(`${t} -> ${parseAmount(t)}`);
}
