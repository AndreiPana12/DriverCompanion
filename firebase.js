// firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import Constants from 'expo-constants';

const firebaseConfig = {
  apiKey: "AIzaSyA7nV8l8vfw4HwycnLEtUkMGkVRH67IHPY",
  authDomain: "myexpoapp-f5c69.firebaseapp.com",
  projectId: "myexpoapp-f5c69",
  storageBucket: "myexpoapp-f5c69.firebasestorage.app",
  messagingSenderId: "35101748334",
  appId: "1:35101748334:web:98effa5ef830476a49ca7f",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
export { auth,db };
