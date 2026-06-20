import re

with open('app/admin/page.tsx', 'r') as f:
    content = f.read()

print("--- FETCH DATA ---")
m = re.search(r'(const fetchData = async \(\) => \{.*?\n  \};)', content, re.DOTALL)
if m: print(m.group(1))

print("--- REGISTRY TAB ---")
m = re.search(r'(\{activeTab === \'registry\' && \(.*?\n          \)\})', content, re.DOTALL)
if m: print(m.group(1))

