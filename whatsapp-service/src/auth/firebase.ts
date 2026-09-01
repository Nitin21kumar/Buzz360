import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import { config } from "../core/config";

let initErrorMessage: string | null = null;

export function getFirebaseAuth() {
  if (getApps().length === 0) {
    if (!config.firebaseServiceAccountPath) {
      initErrorMessage =
        "FIREBASE_SERVICE_ACCOUNT_PATH is not configured. Point it at the same service-account JSON " +
        "the FastAPI backend uses (Firebase Console > Project Settings > Service Accounts) — never commit it.";
      throw new Error(initErrorMessage);
    }
    initializeApp({ credential: cert(config.firebaseServiceAccountPath) });
  }
  return getAuth();
}
