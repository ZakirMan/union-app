import sys

filepath = 'app/api/send-notification/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

old_json = "const { title, body, userIds } = await request.json();"
new_json = "const { title, body, userIds, link } = await request.json();"
content = content.replace(old_json, new_json)

old_message = '''      webpush: {
        notification: {
          icon: 'https://union-app-two.vercel.app/icon-192.png',
          badge: 'https://union-app-two.vercel.app/icon-192.png'
        }
      },'''

new_message = '''      webpush: {
        notification: {
          icon: 'https://union-app-two.vercel.app/icon-192.png',
          badge: 'https://union-app-two.vercel.app/icon-192.png'
        },
        fcmOptions: {
          link: link || 'https://union-app-two.vercel.app/dashboard'
        }
      },'''
content = content.replace(old_message, new_message)

with open(filepath, 'w') as f:
    f.write(content)

print("API route patched")
