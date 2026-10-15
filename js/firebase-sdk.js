// The only place the Firebase SDK is loaded (local test harnesses swap this module for a stub).
export { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
export {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
export { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";
