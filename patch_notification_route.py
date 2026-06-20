import sys

filepath = 'app/api/send-notification/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

old_message = '''    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: tokens,
    };'''

new_message = '''    const message = {
      notification: {
        title: title,
        body: body,
      },
      webpush: {
        notification: {
          icon: '/icon-192.png',
          badge: '/icon-192.png'
        }
      },
      tokens: tokens,
    };'''

content = content.replace(old_message, new_message)

with open(filepath, 'w') as f:
    f.write(content)

print("Route patched")
