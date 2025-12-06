// App.js
import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { AppState } from 'react-native';

import { auth } from './config/firebaseConfig';
import { registerForPushNotifications, setupNotificationListeners } from './services/notificationService';
import { initActivityTracking, stopActivityTracking, setUserOffline, setUserOnline } from './utils/activityTracker';
import Login from './screens/Auth';
import Register from './screens/Register';
import Home from './screens/Home';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const appState = useRef(AppState.currentState);
  const navigationRef = useRef();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        console.log('Utilisateur connecté:', u.email);
        
        initActivityTracking(u.uid);
        
        await registerForPushNotifications(u.uid);
      } else {
        stopActivityTracking();
      }
      if (initializing) setInitializing(false);
    });

    return () => {
      unsub();
      stopActivityTracking();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App au premier plan');
        setUserOnline();
      } else if (
        appState.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        console.log('App en arrière-plan');
        setUserOffline();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription?.remove();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const cleanup = setupNotificationListeners(navigationRef.current);

    return () => {
      console.log('App fermée');
      stopActivityTracking();
      cleanup();
    };
  }, [user]);

  if (initializing) return null;

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Home" component={Home} />
        ) : (
          <>
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Register" component={Register} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}