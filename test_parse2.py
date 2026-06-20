import re

def parse_amount(s):
    s = re.sub(r'\s+', '', s)
    s = re.sub(r'[^\d.,-]', '', s)
    last_dot = s.rfind('.')
    last_comma = s.rfind(',')
    sep_idx = max(last_dot, last_comma)
    
    if sep_idx != -1:
        has_both = (last_dot != -1) and (last_comma != -1)
        if has_both:
            if last_dot > last_comma:
                s = s.replace(',', '')
            else:
                s = s.replace('.', '')
                s = s[:last_comma] + '.' + s[last_comma+1:]
        else:
            if len(s) - sep_idx - 1 == 2:
                s = s[:sep_idx].replace('.', '').replace(',', '') + '.' + s[sep_idx+1:]
            elif len(s) - sep_idx - 1 == 3:
                s = s.replace('.', '').replace(',', '')
            else:
                s = s[:sep_idx].replace('.', '').replace(',', '') + '.' + s[sep_idx+1:]
                
    try:
        return float(s)
    except:
        return 0.0

tests = [
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
]

for t in tests:
    print(f"{t} -> {parse_amount(t)}")
