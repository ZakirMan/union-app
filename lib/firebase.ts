// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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