// services/notificationService.js

export async function registerForPushNotifications(userId) {
  console.log('Push notifications désactivées en mode Expo Go');
  console.log('Utilisez un development build pour activer les notifications');
  return null;
}

export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  console.log('Notification désactivée:', title, body);
  return null;
}

export function setupNotificationListeners(navigation) {
  console.log('Notification listeners désactivés en mode Expo Go');
  return () => {}; 
}