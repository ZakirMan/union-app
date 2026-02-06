import admin from 'firebase-admin';

// --- ВНИМАНИЕ: СЮДА ВСТАВЬТЕ ДАННЫЕ ИЗ СКАЧАННОГО JSON ---
// --- ВНИМАНИЕ: КЛЮЧИ ТЕПЕРЬ В .env.local ---
const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
    if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.warn("⚠️ Firebase Admin not initialized: Missing environment variables.");
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminMessaging = admin.messaging();
