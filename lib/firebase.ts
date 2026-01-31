// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging"; // <--- ДОБАВЛЕНО

const firebaseConfig = {
  apiKey: "AIzaSyCBI0mwBLIpOs_sDCBk9tG8eCz3eg-NnVI",
  authDomain: "union-aviation-app.firebaseapp.com",
  projectId: "union-aviation-app",
  storageBucket: "union-aviation-app.firebasestorage.app",
  messagingSenderId: "929818553609",
  appId: "1:929818553609:web:3433f2db79678e075ff7d8"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Безопасная инициализация Messaging (только для клиента/браузера)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messaging: any = null;
if (typeof window !== "undefined") {
  messaging = getMessaging(app);
}

export { messaging };