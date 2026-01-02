import { initializeApp } from "firebase/app";
import { getAuth, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth"
import { getFirestore, setDoc, getDoc, doc} from "firebase/firestore"
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export async function LoginFirebase(action, username, email, password) {
    try {
        let user
        if (action == "signup") {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            user = userCredential.user;
            await setDoc(doc(db, "users", user.uid), { username, email, uid: user.uid });
        } else if (action =="login") {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            user = userCredential.user;
        }
        return "success";
    } catch (error) {
        return error.code;
    }
}

export async function GetUserData() {
  if (!auth.currentUser) {
    throw new Error("No user is logged in");
  }
  const docSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
  let currentUserData
  if (docSnap.exists()) {
    currentUserData = docSnap.data();
  } else {
    currentUserData = null;
    console.error("User doc does not exist.")
  }
  return currentUserData
}

export function signOutUser() {
  signOut(auth).then(() => {
  // Sign-out successful.
  }).catch((error) => {
    console.error("Error when signing out user:", error)
  });
}
