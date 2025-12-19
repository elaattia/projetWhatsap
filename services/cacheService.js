// services/cacheService.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEYS = {
  USER_PROFILE: 'user_profile_',
  CONTACTS: 'contacts_list',
  MESSAGES: 'messages_',
  FORUM_POSTS: 'forum_posts',
  LAST_SYNC: 'last_sync_',
};

const CACHE_DURATION = {
  USER_PROFILE: 30 * 60 * 1000, 
  CONTACTS: 10 * 60 * 1000, 
  MESSAGES: 60 * 1000, 
  FORUM_POSTS: 15 * 60 * 1000, 
};

class CacheService {
  async cacheUserProfile(userId, profile) {
    try {
      const data = {
        profile,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(
        CACHE_KEYS.USER_PROFILE + userId,
        JSON.stringify(data)
      );
      console.log('Profil mis en cache:', userId);
    } catch (e) {
      console.log('Erreur cache profil:', e);
    }
  }

  async getCachedUserProfile(userId) {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.USER_PROFILE + userId);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age > CACHE_DURATION.USER_PROFILE) {
        console.log(' Cache profil expiré');
        await this.clearUserProfile(userId);
        return null;
      }

      console.log(' Profil chargé du cache');
      return data.profile;
    } catch (e) {
      console.log(' Erreur lecture cache profil:', e);
      return null;
    }
  }

  async clearUserProfile(userId) {
    try {
      await AsyncStorage.removeItem(CACHE_KEYS.USER_PROFILE + userId);
    } catch (e) {
      console.log(' Erreur suppression cache profil:', e);
    }
  }





  async cacheContacts(contacts) {
    try {
      const data = {
        contacts,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEYS.CONTACTS, JSON.stringify(data));
      console.log(' Contacts mis en cache:', contacts.length);
    } catch (e) {
      console.log(' Erreur cache contacts:', e);
    }
  }

  async getCachedContacts() {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age > CACHE_DURATION.CONTACTS) {
        console.log(' Cache contacts expiré');
        await this.clearContacts();
        return null;
      }

      console.log(' Contacts chargés du cache');
      return data.contacts;
    } catch (e) {
      console.log(' Erreur lecture cache contacts:', e);
      return null;
    }
  }

  async clearContacts() {
    try {
      await AsyncStorage.removeItem(CACHE_KEYS.CONTACTS);
    } catch (e) {
      console.log(' Erreur suppression cache contacts:', e);
    }
  }






  async cacheMessages(chatKey, messages) {
    try {
      const data = {
        messages,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(
        CACHE_KEYS.MESSAGES + chatKey,
        JSON.stringify(data)
      );
      console.log(' Messages mis en cache:', chatKey);
    } catch (e) {
      console.log(' Erreur cache messages:', e);
    }
  }

  async getCachedMessages(chatKey) {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.MESSAGES + chatKey);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age > CACHE_DURATION.MESSAGES) {
        console.log(' Cache messages expiré');
        await this.clearMessages(chatKey);
        return null;
      }

      console.log(' Messages chargés du cache');
      return data.messages;
    } catch (e) {
      console.log(' Erreur lecture cache messages:', e);
      return null;
    }
  }

  async clearMessages(chatKey) {
    try {
      await AsyncStorage.removeItem(CACHE_KEYS.MESSAGES + chatKey);
    } catch (e) {
      console.log(' Erreur suppression cache messages:', e);
    }
  }









  async cacheForumPosts(posts) {
    try {
      const data = {
        posts,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEYS.FORUM_POSTS, JSON.stringify(data));
      console.log(' Posts forum mis en cache:', posts.length);
    } catch (e) {
      console.log(' Erreur cache forum:', e);
    }
  }

  async getCachedForumPosts() {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEYS.FORUM_POSTS);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      if (age > CACHE_DURATION.FORUM_POSTS) {
        console.log(' Cache forum expiré');
        await this.clearForumPosts();
        return null;
      }

      console.log(' Posts forum chargés du cache');
      return data.posts;
    } catch (e) {
      console.log(' Erreur lecture cache forum:', e);
      return null;
    }
  }

  async clearForumPosts() {
    try {
      await AsyncStorage.removeItem(CACHE_KEYS.FORUM_POSTS);
    } catch (e) {
      console.log(' Erreur suppression cache forum:', e);
    }
  }






  async setLastSync(key, timestamp = Date.now()) {
    try {
      await AsyncStorage.setItem(
        CACHE_KEYS.LAST_SYNC + key,
        timestamp.toString()
      );
    } catch (e) {
      console.log('Erreur setLastSync:', e);
    }
  }

  async getLastSync(key) {
    try {
      const timestamp = await AsyncStorage.getItem(CACHE_KEYS.LAST_SYNC + key);
      return timestamp ? parseInt(timestamp) : null;
    } catch (e) {
      console.log(' Erreur getLastSync:', e);
      return null;
    }
  }




  async clearAllCache() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        Object.values(CACHE_KEYS).some(prefix => key.startsWith(prefix))
      );
      await AsyncStorage.multiRemove(cacheKeys);
      console.log(' Tout le cache supprimé');
    } catch (e) {
      console.log(' Erreur clearAllCache:', e);
    }
  }





  async getCacheStats() {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        Object.values(CACHE_KEYS).some(prefix => key.startsWith(prefix))
      );
      
      let totalSize = 0;
      const items = [];

      for (const key of cacheKeys) {
        const value = await AsyncStorage.getItem(key);
        const size = new Blob([value]).size;
        totalSize += size;
        items.push({ key, size });
      }

      return {
        totalItems: cacheKeys.length,
        totalSize: (totalSize / 1024).toFixed(2) + ' KB',
        items,
      };
    } catch (e) {
      console.log(' Erreur getCacheStats:', e);
      return null;
    }
  }
}

export default new CacheService();