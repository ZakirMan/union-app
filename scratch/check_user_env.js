const admin = require('firebase-admin');
const fs = require('fs');

const envLocal = fs.readFileSync('/Users/zakir/union-app/.env.local', 'utf8');
const env = {};
envLocal.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) {
    env[key.trim()] = vals.join('=').trim();
  }
});

let privateKey = env.FIREBASE_PRIVATE_KEY;
if (privateKey) {
    privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

const serviceAccount = {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUser() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', 'alexeyevaiya@gmail.com').get();
  
  if (snapshot.empty) {
    console.log('No matching documents.');
    process.exit(0);
  }  
  
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
  process.exit(0);
}

checkUser().catch(err => {
    console.error(err);
    process.exit(1);
});
