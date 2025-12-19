// utils/cacheUtils.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import CacheService from '../services/cacheService';


export async function cleanExpiredCache() {
  try {
    console.log(' Nettoyage du cache expiré...');
    const stats = await CacheService.getCacheStats();
    console.log(`Cache actuel: ${stats.totalItems} items, ${stats.totalSize}`);
    
    
    return stats;
  } catch (e) {
    console.log('Erreur cleanExpiredCache:', e);
  }
}


export async function preloadEssentialData(userId) {
  try {
    console.log('Préchargement des données essentielles...');
    
    
    const { supabase } = require('../config/supabaseClient');
    
    
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profile) {
      await CacheService.cacheUserProfile(userId, profile);
      console.log(' Profil préchargé');
    }
    
   
    const { data: contacts } = await supabase
      .from('users')
      .select('*')
      .neq('id', userId);
    
    if (contacts) {
      await CacheService.cacheContacts(contacts);
      console.log(' Contacts préchargés');
    }
    
    
    const { data: posts } = await supabase
      .from('forum_posts')
      .select(`
        *,
        users (name, avatar, email)
      `)
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (posts) {
      await CacheService.cacheForumPosts(posts);
      console.log(' Posts forum préchargés');
    }
    
    console.log(' Préchargement terminé !');
  } catch (e) {
    console.log('Erreur preloadEssentialData:', e);
  }
}


export async function logCacheStats() {
  try {
    const stats = await CacheService.getCacheStats();
    console.log(' STATISTIQUES DU CACHE ');
    console.log(`Total items: ${stats.totalItems}`);
    console.log(`Taille totale: ${stats.totalSize}`);
    console.log('Détails:');
    stats.items.forEach(item => {
      console.log(`  - ${item.key}: ${(item.size / 1024).toFixed(2)} KB`);
    });
    return stats;
  } catch (e) {
    console.log('Erreur logCacheStats:', e);
  }
}


export async function clearAllAppCache() {
  try {
    console.log(' Suppression de tout le cache...');
    await CacheService.clearAllCache();
    console.log('Cache complètement vidé');
  } catch (e) {
    console.log('Erreur clearAllAppCache:', e);
  }
}



export async function syncDataInBackground(userId) {
  try {
    console.log(' Synchronisation en arrière-plan...');
    
    const { supabase } = require('../config/supabaseClient');
    
    const lastSync = await CacheService.getLastSync('global');
    const now = Date.now();
    const timeSinceLastSync = now - (lastSync || 0);
    
    if (timeSinceLastSync < 5 * 60 * 1000) {
      console.log('⏭ Synchro trop récente, ignorée');
      return;
    }
    
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profile) {
      await CacheService.cacheUserProfile(userId, profile);
    }
    
    const { data: contacts } = await supabase
      .from('users')
      .select('*')
      .neq('id', userId);
    
    if (contacts) {
      await CacheService.cacheContacts(contacts);
    }
    
    await CacheService.setLastSync('global', now);
    
    console.log(' Synchronisation terminée');
  } catch (e) {
    console.log('Erreur syncDataInBackground:', e);
  }
}


export function useCachedData(key, fetchFunction, dependencies = []) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        
        const cached = await AsyncStorage.getItem(key);
        
        if (cached && mounted) {
          const parsed = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          
          if (age < 10 * 60 * 1000) {
            setData(parsed.data);
            setLoading(false);
          }
        }
        
        const freshData = await fetchFunction();
        
        if (mounted) {
          setData(freshData);
          
          await AsyncStorage.setItem(key, JSON.stringify({
            data: freshData,
            timestamp: Date.now()
          }));
        }
      } catch (e) {
        if (mounted) {
          setError(e);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, dependencies);

  return { data, loading, error };
}


export async function getCacheSizeInMB() {
  try {
    const stats = await CacheService.getCacheStats();
    const sizeInKB = parseFloat(stats.totalSize.replace(' KB', ''));
    const sizeInMB = (sizeInKB / 1024).toFixed(2);
    return `${sizeInMB} MB`;
  } catch (e) {
    console.log('Erreur getCacheSizeInMB:', e);
    return '0 MB';
  }
}


export async function isCacheTooLarge() {
  try {
    const stats = await CacheService.getCacheStats();
    const sizeInKB = parseFloat(stats.totalSize.replace(' KB', ''));
    const sizeInMB = sizeInKB / 1024;
    return sizeInMB > 50;
  } catch (e) {
    console.log('Erreur isCacheTooLarge:', e);
    return false;
  }
}


export async function cleanCacheIfNeeded() {
  try {
    const isTooLarge = await isCacheTooLarge();
    
    if (isTooLarge) {
      console.log(' Cache trop volumineux, nettoyage...');
      await CacheService.clearAllCache();
      console.log(' Cache nettoyé');
      return true;
    }
    
    return false;
  } catch (e) {
    console.log('Erreur cleanCacheIfNeeded:', e);
    return false;
  }
}

export default {
  cleanExpiredCache,
  preloadEssentialData,
  logCacheStats,
  clearAllAppCache,
  syncDataInBackground,
  useCachedData,
  getCacheSizeInMB,
  isCacheTooLarge,
  cleanCacheIfNeeded,
};