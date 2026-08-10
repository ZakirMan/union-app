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

const bucket = admin.storage().bucket('union-aviation-app.firebasestorage.app'); 

async function checkStorage() {
  const prefix = 'RQ1MmvJY4HPWCzxbkjbCkMo6nHo1'; // UID of alexeyevaiya
  
  console.log("Checking storage for UID:", prefix);
  
  const [files1] = await bucket.getFiles({ prefix: `registration_statements/${prefix}` });
  console.log("registration_statements files:", files1.map(f => f.name));

  const [files2] = await bucket.getFiles({ prefix: `id_cards/${prefix}` });
  console.log("id_cards files:", files2.map(f => f.name));
  
  process.exit(0);
}

checkStorage().catch(err => {
    console.error(err);
    process.exit(1);
});
