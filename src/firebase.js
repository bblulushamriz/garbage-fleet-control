import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// הדבק כאן את ה-Config שהעתקת מה-Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyBjsI_3kNfDyb-mkAzxj4XHTfKlm1nvY1s",
  authDomain: "garbage-fleet-control.firebaseapp.com",
  projectId: "garbage-fleet-control",
  storageBucket: "garbage-fleet-control.firebasestorage.app",
  messagingSenderId: "499170714328",
  appId: "1:499170714328:web:c0975261cc22f8671b6dad"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);