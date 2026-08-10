const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function checkUser() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.where('email', '==', 'alexeyevaiya@gmail.com').get();
  
  if (snapshot.empty) {
    console.log('No matching documents.');
    return;
  }  
  
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
}

checkUser();
