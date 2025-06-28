// firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import Constants from 'expo-constants';

const firebaseConfig = {
  apiKey: Constants.expoConfig?.extra?.firebaseApiKey || process.env.FIREBASE_API_KEY || 'AIzaSyC1NLydQ10qn1plTIeyaKYwwMg7oOZzkik',
  authDomain: 'myexpoapp-1cca0.firebaseapp.com',
  projectId: 'myexpoapp-1cca0',
  storageBucket: 'myexpoapp-1cca0.appspot.com',
  messagingSenderId: '211885263665',
  appId: '1:211885263665:web:5f62b9b83e68f62b62fe10',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export { auth,db };
