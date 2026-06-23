import sys

filepath = 'firestore.rules'
with open(filepath, 'r') as f:
    content = f.read()

old_poll = "hasAny(['title', 'options', 'createdAt', 'endDate', 'status']);"
new_poll = "hasAny(['question', 'createdAt', 'endDate', 'status']);"

content = content.replace(old_poll, new_poll)

with open(filepath, 'w') as f:
    f.write(content)

print("Rules patched")
