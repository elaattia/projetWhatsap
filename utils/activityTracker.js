// utils/activityTracker.js
import { supabase } from '../config/supabaseClient';

let inactivityTimer = null;
let currentUserId = null;

const updateOnlineStatus = async (userId, isOnline) => {
  try {
    await supabase
      .from('users')
      .update({ 
        is_online: isOnline,
        last_seen: new Date().toISOString()
      })
      .eq('id', userId);
    console.log(`Statut: ${isOnline ? 'EN LIGNE' : 'HORS LIGNE'}`);
  } catch (e) {
    console.log('updateOnlineStatus error', e);
  }
};

const startInactivityTimer = (userId) => {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }

  inactivityTimer = setTimeout(() => {
    console.log('1 minute sans activité - Passage HORS LIGNE');
    updateOnlineStatus(userId, false);
  }, 60000); 
};

export const resetUserActivity = () => {
  if (!currentUserId) return;
  
  console.log('Activité détectée - Réinitialisation du timer');
  
  updateOnlineStatus(currentUserId, true);
  
  startInactivityTimer(currentUserId);
};

export const initActivityTracking = (userId) => {
  console.log('Tracking d\'activité initialisé pour:', userId);
  currentUserId = userId;
  updateOnlineStatus(userId, true);
  startInactivityTimer(userId);
};

export const stopActivityTracking = () => {
  console.log('Arrêt du tracking d\'activité');
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
  }
  if (currentUserId) {
    updateOnlineStatus(currentUserId, false);
  }
  currentUserId = null;
};

export const setUserOffline = () => {
  if (currentUserId) {
    console.log('Mise hors ligne immédiate');
    updateOnlineStatus(currentUserId, false);
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
  }
};

export const setUserOnline = () => {
  if (currentUserId) {
    console.log('Remise en ligne');
    updateOnlineStatus(currentUserId, true);
    startInactivityTimer(currentUserId);
  }
};