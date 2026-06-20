import re

lines = [
    "1	Абайылданова Ельмира Омирбаевна	3,331.36",
    "2	Абдивалиев Рафхат Адилжанович	2,849.92",
    "3	Абдигалиева Жанар Шаудирбаевна	3,012.92",
    "4	Абдиева Маржан Еркебулановна	574.62",
    "5	Абдирахманова Алия Фазылбеккызы	2,331.51"
]

total = 0
for line in lines:
    parts = line.split('\t')
    amountStr = parts[-1]
    
    # Simulate JS logic
    # .replace(/,/g, '.')
    s1 = amountStr.replace(',', '.')
    # .replace(/[^\d.-]/g, '')
    s2 = re.sub(r'[^\d.-]', '', s1)
    
    # parseFloat stops at the second dot in JS! Python float() crashes.
    # We will simulate parseFloat:
    m = re.match(r'^-?\d+(\.\d+)?', s2)
    val = float(m.group(0)) if m else 0
    total += val
    print(f"Original: {amountStr} -> JS parsed: {val}")
print(f"Total: {total}")
