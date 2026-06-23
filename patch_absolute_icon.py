import sys

filepath = 'app/api/send-notification/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

old_webpush = '''      webpush: {
        notification: {
          icon: '/icon-192.png',
          badge: '/icon-192.png'
        }
      },'''

new_webpush = '''      webpush: {
        notification: {
          icon: 'https://union-app-two.vercel.app/icon-192.png',
          badge: 'https://union-app-two.vercel.app/icon-192.png'
        }
      },'''

content = content.replace(old_webpush, new_webpush)

with open(filepath, 'w') as f:
    f.write(content)

print("Icon patched to absolute URL")
