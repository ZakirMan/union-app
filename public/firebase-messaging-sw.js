// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCBI0mwBLIpOs_sDCBk9tG8eCz3eg-NnVI",
  authDomain: "union-aviation-app.firebaseapp.com",
  projectId: "union-aviation-app",
  storageBucket: "union-aviation-app.firebasestorage.app",
  messagingSenderId: "929818553609",
  appId: "1:929818553609:web:3433f2db79678e075ff7d8"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Обработка фоновых сообщений
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
});