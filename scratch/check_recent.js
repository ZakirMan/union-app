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
const auth = admin.auth();

async function checkUser() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.orderBy('createdAt', 'desc').limit(10).get();
  
  console.log("Recent users in Firestore:");
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data().email, doc.data().displayName, doc.data().createdAt);
  });
  
  console.log("\nChecking Auth for alexeyeva...");
  try {
     const user = await auth.getUserByEmail('alexeyevaiya@gmail.com');
     console.log("Found in Auth:", user.uid, user.email, user.metadata.creationTime);
     
     const doc = await usersRef.doc(user.uid).get();
     if (doc.exists) {
        console.log("User doc exists in Firestore by UID!", doc.data().email);
     } else {
        console.log("User doc DOES NOT exist in Firestore!");
     }
  } catch(e) {
     console.log("Auth error:", e.message);
  }

  process.exit(0);
}

checkUser().catch(err => {
    console.error(err);
    process.exit(1);
});
