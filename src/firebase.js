import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore"; // 1. משנים את הייבוא ל-initializeFirestore
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  // השאר כאן את הגדרות ה-API Key והפרויקט המקוריות שלך בדיוק כפי שהן!
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);

// 2. 🛠️ התיקון המכריע: מאתחלים את Firestore עם הגדרת כפיית Long Polling
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const storage = getStorage(app);