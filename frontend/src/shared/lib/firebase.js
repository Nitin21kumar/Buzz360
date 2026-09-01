import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'


const REQUIRED_KEYS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID']
export const missingFirebaseEnvVars = REQUIRED_KEYS.filter((key) => !import.meta.env[key])

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}


export const firebaseApp = missingFirebaseEnvVars.length
  ? null
  : (getApps().length ? getApp() : initializeApp(firebaseConfig))
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null
