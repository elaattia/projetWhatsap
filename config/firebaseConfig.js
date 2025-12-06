// config/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { 
  initializeAuth, 
  browserLocalPersistence,
  getReactNativePersistence
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStorage } from "firebase/storage";


const firebaseConfig = {
  apiKey: "AIzaSyCscmPPiB7EF0v59XNiN0xeKIjjZ18SJYc",
  authDomain: "attiaelawhatsapp.firebaseapp.com",
  projectId: "attiaelawhatsapp",
  storageBucket: "attiaelawhatsapp.appspot.com",
  messagingSenderId: "30552536734",
  appId: "1:30552536734:web:9a0fc44a0ccc939d85ad8f",
};

const app = initializeApp(firebaseConfig);


let auth;

if (typeof window !== "undefined") {

  auth = initializeAuth(app, {
    persistence: browserLocalPersistence,
  });
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { auth };


export const storage = getStorage(app);

export default app;
