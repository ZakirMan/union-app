import sys

filepath = 'public/firebase-messaging-sw.js'
with open(filepath, 'r') as f:
    content = f.read()

old_bg = '''// Обработка фоновых сообщений
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon-192.png', // Ваша иконка
    badge: '/icon-192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});'''

new_bg = '''// Обработка фоновых сообщений
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Браузер сам покажет уведомление, так как сервер отправляет объект "notification".
  // Не вызываем self.registration.showNotification, чтобы избежать дублирования.
});'''

content = content.replace(old_bg, new_bg)

with open(filepath, 'w') as f:
    f.write(content)

print("SW patched")
