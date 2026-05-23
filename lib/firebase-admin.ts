import admin from 'firebase-admin';

// --- ВНИМАНИЕ: СЮДА ВСТАВЬТЕ ДАННЫЕ ИЗ СКАЧАННОГО JSON ---
// --- ВНИМАНИЕ: КЛЮЧИ ТЕПЕРЬ В .env.local ---
let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
    privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
};

if (!admin.apps.length) {
    if (serviceAccount.projectId && serviceAccount.clientEmail && serviceAccount.privateKey) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (error) {
            console.error('Firebase Admin initialization error', error);
        }
    } else {
        console.warn("⚠️ Firebase Admin not initialized: Missing environment variables.");
    }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export const adminMessaging = admin.messaging();
