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

async function deleteStuckUser() {
  const email = 'alexeyevaiya@gmail.com';
  try {
     const user = await admin.auth().getUserByEmail(email);
     await admin.auth().deleteUser(user.uid);
     console.log(`Successfully deleted stuck user: ${email} (${user.uid})`);
  } catch (error) {
     console.log('Error deleting user:', error.message);
  }
  process.exit(0);
}

deleteStuckUser();
