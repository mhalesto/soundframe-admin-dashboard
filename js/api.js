// Firebase app, auth and the admin callables. Authorization is enforced server-side on every call;
// the config below is the public web-app config (no secrets live in the frontend).
import {
  initializeApp,
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  getFunctions,
  httpsCallable
} from "./firebase-sdk.js";

const firebaseConfig = {
  projectId: "soundframe-1b8d4",
  appId: "1:738680654271:web:591e3f4e364626656eb90a",
  storageBucket: "soundframe-1b8d4.firebasestorage.app",
  apiKey: "AIzaSyDyL-KQ4AzCPy_TumcgdEW6M9BGlsVuwqY",
  authDomain: "soundframe-1b8d4.firebaseapp.com",
  messagingSenderId: "738680654271",
  measurementId: "G-W60KKZCNER"
};

export const PROJECT_ID = firebaseConfig.projectId;
export const FUNCTIONS_REGION = "europe-west1";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, FUNCTIONS_REGION);
const googleProvider = new GoogleAuthProvider();

const callables = {
  status: httpsCallable(functions, "soundframeAdminStatus"),
  dashboard: httpsCallable(functions, "soundframeAdminDashboard"),
  updateLimits: httpsCallable(functions, "soundframeAdminUpdateUserLimits"),
  financeMonitor: httpsCallable(functions, "soundframeAdminFinanceMonitor"),
  financeSync: httpsCallable(functions, "soundframeAdminFinanceSync", { timeout: 150000 }),
  financeSettings: httpsCallable(functions, "soundframeAdminFinanceUpdateSettings")
};

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signInGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signInAnon() {
  return signInAnonymously(auth);
}

export function signOutAdmin() {
  return signOut(auth);
}

async function call(name, user, payload = {}, forceToken = false) {
  const authIDToken = await user.getIdToken(forceToken);
  const result = await callables[name]({ authIDToken, ...payload });
  return result.data;
}

export const api = {
  status: (user) => call("status", user, {}, true),
  dashboard: (user) => call("dashboard", user),
  updateLimits: (user, payload) => call("updateLimits", user, payload, true),
  financeMonitor: (user) => call("financeMonitor", user),
  financeSync: (user) => call("financeSync", user),
  financeSettings: (user, settings) => call("financeSettings", user, { settings })
};

/** Human message plus a coarse category for state rendering. */
export function describeError(error) {
  const code = String(error?.code || "").replace(/^functions\//, "");
  const message = error?.message || String(error || "Something went wrong.");
  let kind = "error";
  if (code === "permission-denied" || code === "unauthenticated") kind = "permission";
  else if (code === "not-found" || /not found/i.test(message)) kind = "missing";
  else if (code === "unavailable" || code === "deadline-exceeded" || /network|fetch|offline/i.test(message)) kind = "network";
  return { code, message, kind };
}
