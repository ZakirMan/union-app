// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
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

// Enable offline persistence
if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
    } else if (err.code === "unimplemented") {
      console.warn("The current browser does not support all of the features required to enable persistence.");
    }
  });
}

// Безопасная инициализация Messaging (только для клиента/браузера)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let messaging: any = null;
if (typeof window !== "undefined") {
  messaging = getMessaging(app);
}

export { messaging };