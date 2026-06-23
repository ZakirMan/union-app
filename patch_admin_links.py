import sys

filepath = 'app/admin/page.tsx'
with open(filepath, 'r') as f:
    content = f.read()

# 1. Update sendPushNotification signature
old_sig = '''  const sendPushNotification = async (title: string, body: string, userIds?: string[]) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body, userIds }),
      });'''

new_sig = '''  const sendPushNotification = async (title: string, body: string, userIds?: string[], link?: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title, body, userIds, link }),
      });'''
content = content.replace(old_sig, new_sig)

# 2. News Push
old_news = "await sendPushNotification('⚡️ Свежая новость', newsTitle);"
new_news = "await sendPushNotification('⚡️ Свежая новость', newsTitle, undefined, 'https://union-app-two.vercel.app/dashboard?tab=news');"
content = content.replace(old_news, new_news)

# 3. Poll Push
old_poll = "await sendPushNotification('📊 Новый опрос', `Пожалуйста, уделите минуту: ${pollQuestion}`, targetUserIds);"
new_poll = "await sendPushNotification('📊 Новый опрос', `Пожалуйста, уделите минуту: ${pollQuestion}`, targetUserIds, 'https://union-app-two.vercel.app/dashboard?tab=polls');"
content = content.replace(old_poll, new_poll)

# 4. Test Push
old_test = "await sendPushNotification('🎓 Новый тест доступен', `Проверьте свои знания: ${testTitle}`);"
new_test = "await sendPushNotification('🎓 Новый тест доступен', `Проверьте свои знания: ${testTitle}`, undefined, 'https://union-app-two.vercel.app/dashboard?tab=training');"
content = content.replace(old_test, new_test)

with open(filepath, 'w') as f:
    f.write(content)

print("Admin page patched")
