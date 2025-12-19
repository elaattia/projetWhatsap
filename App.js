// App.js (avec initialisation AsyncStorage)
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, StyleSheet, AppState } from 'react-native';
import { auth } from './config/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { supabase } from './config/supabaseClient';

import Login from './screens/Auth';
import Register from './screens/Register';
import Home from './screens/Home';

import { initActivityTracking, stopActivityTracking, setUserOffline, setUserOnline } from './utils/activityTracker';
import CacheService from './services/cacheService';

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appState, setAppState] = useState(AppState.currentState);

  // Gérer le statut en ligne/hors ligne quand l'app est en arrière-plan
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      console.log('AppState changé:', appState, '→', nextAppState);
      
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // L'app revient au premier plan
        console.log('App revenue au premier plan');
        if (user) {
          setUserOnline();
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // L'app passe en arrière-plan
        console.log('App en arrière-plan');
        if (user) {
          setUserOffline();
        }
      }

      setAppState(nextAppState);
    });

    return () => {
      subscription?.remove();
    };
  }, [appState, user]);

  // Gérer l'authentification et le statut utilisateur
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log('Auth state changed:', fbUser?.uid);
      
      if (fbUser) {
        // Utilisateur connecté
        setUser(fbUser);
        
        // Initialiser le tracking d'activité
        initActivityTracking(fbUser.uid);
        
        // Charger le profil depuis le cache ou Supabase
        const cachedProfile = await CacheService.getCachedUserProfile(fbUser.uid);
        
        if (!cachedProfile) {
          // Si pas en cache, charger depuis Supabase et mettre en cache
          try {
            const { data, error } = await supabase
              .from('users')
              .select('*')
              .eq('id', fbUser.uid)
              .single();
            
            if (!error && data) {
              await CacheService.cacheUserProfile(fbUser.uid, data);
              console.log('✅ Profil chargé et mis en cache');
            }
          } catch (e) {
            console.log('Erreur chargement profil initial:', e);
          }
        } else {
          console.log('📦 Profil trouvé dans le cache');
        }
      } else {
        // Utilisateur déconnecté
        setUser(null);
        
        // Arrêter le tracking et nettoyer le cache
        stopActivityTracking();
        await CacheService.clearAllCache();
        console.log('🗑️ Cache nettoyé après déconnexion');
      }
      
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (user) {
        stopActivityTracking();
      }
    };
  }, []);

  // Afficher l'indicateur de chargement
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  return (
    <NavigationContainer>
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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});