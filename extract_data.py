import json
import re
import sys

transcript_path = "/Users/zakir/.gemini/antigravity/brain/640b12e1-1b0a-4282-b83a-c0ce43c18305/.system_generated/logs/transcript_full.jsonl"

content = ""
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        step = json.loads(line)
        if step.get('type') == 'USER_INPUT':
            content += step.get('content', '') + "\n"

# Extract names
name_pattern = re.compile(r"^\d{2}\.\d{2}\.\d{4}.*?\s+(\d+)\s+(\d+(?:-\d+)?)\s+(.+?)\s+(\d{12})$", re.MULTILINE)
names = []
for match in name_pattern.finditer(content):
    names.append(match.group(3).strip())

# Extract amounts
amount_pattern = re.compile(r"1\s+([\d,]+\.\d{2})\s*$", re.MULTILINE)
amounts = []
for match in amount_pattern.finditer(content):
    amt_str = match.group(1).replace(',', '')
    amounts.append(float(amt_str))

print(f"Found {len(names)} names and {len(amounts)} amounts.")

if len(names) == 0 or len(amounts) == 0:
    print("Error: Could not extract data.")
    sys.exit(1)

min_len = min(len(names), len(amounts))
if len(names) != len(amounts):
    print("Warning: Counts do not match! Truncating to minimum length.")

import pandas as pd

df = pd.DataFrame({
    'ФИО': names[:min_len],
    'Сумма выплат': amounts[:min_len]
})

output_path = "/Users/zakir/union-app/Выплаты_Профсоюз.xlsx"
try:
    df.to_excel(output_path, index=False)
    print(f"Successfully saved to {output_path}")
except ImportError:
    print("pandas/openpyxl not found, writing to CSV instead")
    csv_path = "/Users/zakir/union-app/Выплаты_Профсоюз.csv"
    df.to_csv(csv_path, index=False, encoding='utf-8-sig')
    print(f"Saved to {csv_path}")

