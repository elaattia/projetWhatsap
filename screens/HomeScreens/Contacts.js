// screens/HomeScreens/Contacts.js (avec messages non lus)
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import CacheService from '../../services/cacheService';

export default function Contacts({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});

  const currentUser = auth.currentUser;

  const loadUnreadCounts = async () => {
    if (!currentUser) return;
    
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id, chat_key')
        .eq('receiver_id', currentUser.uid)
        .eq('is_read', false);

      if (error) throw error;

      const counts = {};
      data.forEach(msg => {
        counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1;
      });

      console.log(' Compteurs non lus:', counts);
      setUnreadCounts(counts);
    } catch (e) {
      console.log(' Erreur loadUnreadCounts:', e);
    }
  };

  const loadContacts = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        setLoading(true);
        
        const cachedContacts = await CacheService.getCachedContacts();
        
        if (cachedContacts) {
          console.log(' Contacts chargés depuis le cache');
          setContacts(cachedContacts);
          setLoading(false);
        }
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .neq('id', currentUser ? currentUser.uid : '');
        
      if (error) throw error;

      await CacheService.cacheContacts(data || []);
      setContacts(data || []);
      
      await loadUnreadCounts();
      
    } catch (e) {
      console.log(' loadContacts error', e);
      if (!contacts.length) {
        Alert.alert('Erreur', 'Impossible de charger les contacts');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadContacts(true);
  };

  useEffect(() => {
    loadContacts();

    const usersChannel = supabase
      .channel('users_realtime_all')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'users' 
      }, async (payload) => {
        const updatedContacts = contacts.map((u) => 
          u.id === payload.new.id ? {...u, ...payload.new} : u
        );
        setContacts(updatedContacts);
        await CacheService.cacheContacts(updatedContacts);
      })
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'users' 
      }, async (payload) => {
        const updatedContacts = [...contacts, payload.new];
        setContacts(updatedContacts);
        await CacheService.cacheContacts(updatedContacts);
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'users' 
      }, async (payload) => {
        const updatedContacts = contacts.filter((u) => u.id !== payload.old.id);
        setContacts(updatedContacts);
        await CacheService.cacheContacts(updatedContacts);
      })
      .subscribe();

    const messagesChannel = supabase
      .channel('messages_unread_tracking')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const newMsg = payload.new;
        
        if (newMsg.receiver_id === currentUser.uid && !newMsg.is_read) {
          console.log(' Nouveau message non lu de:', newMsg.sender_id);
          setUnreadCounts(prev => ({
            ...prev,
            [newMsg.sender_id]: (prev[newMsg.sender_id] || 0) + 1
          }));
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        const updatedMsg = payload.new;
        
        if (updatedMsg.receiver_id === currentUser.uid && updatedMsg.is_read) {
          console.log(' Message marqué lu de:', updatedMsg.sender_id);
          loadUnreadCounts(); 
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('🔄 Écran Contacts focus, rechargement compteurs');
      loadUnreadCounts();
    });

    return unsubscribe;
  }, [navigation]);

  const openChat = (contact) => {
    if (!currentUser) return Alert.alert('Erreur', 'Utilisateur non connecté');
    const id1 = currentUser.uid;
    const id2 = contact.id;
    const chatKey = id1 > id2 ? `${id1}_${id2}` : `${id2}_${id1}`;
    
    setUnreadCounts(prev => ({
      ...prev,
      [contact.id]: 0
    }));
    
    navigation.navigate('ChatScreen', { contact, chatKey });
  };

  if (loading && !contacts.length) {
    return (
      <ActivityIndicator style={{flex:1, justifyContent:'center'}} size="large" color="#25D366" />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contacts</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#25D366']}
            tintColor="#25D366"
          />
        }
        renderItem={({ item }) => {
          const unreadCount = unreadCounts[item.id] || 0;
          const hasUnread = unreadCount > 0;
          
          return (
            <TouchableOpacity 
              style={[styles.row, hasUnread && styles.rowUnread]} 
              onPress={() => openChat(item)}
            >
              <View style={styles.avatarContainer}>
                {item.avatar ? (
                  <Image source={{ uri: item.avatar }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="person" size={32} color="#999" />
                  </View>
                )}
                
                <View style={[styles.statusBadge, item.is_online ? styles.online : styles.offline]} />
              </View>

              <View style={{flex:1}}>
                <Text style={[styles.name, hasUnread && styles.nameUnread]}>
                  {item.name || item.email}
                </Text>
                <Text style={[styles.sub, hasUnread && styles.subUnread]}>
                  {hasUnread ? `${unreadCount} nouveau${unreadCount > 1 ? 'x' : ''} message${unreadCount > 1 ? 's' : ''}` : 
                   item.is_online ? 'En ligne' : 'Hors ligne'}
                </Text>
              </View>

              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Aucun contact</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.retryBtn}>
              <Text style={styles.retryText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: '#25D366',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  refreshBtn: {
    padding: 4,
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 12, 
    paddingHorizontal: 16,
    borderBottomWidth: 1, 
    borderColor: '#f0f0f0',
    backgroundColor: '#fff'
  },
  rowUnread: {
    backgroundColor: '#f0f8f4'
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: { 
    width: 56, 
    height: 56, 
    borderRadius: 28, 
    backgroundColor: '#f0f0f0'
  },
  statusBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  online: { backgroundColor: '#25D366' },
  offline: { backgroundColor: '#999' },
  name: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#000' 
  },
  nameUnread: { 
    fontWeight: '700'
  },
  sub: { 
    color: '#666', 
    fontSize: 13, 
    marginTop: 2 
  },
  subUnread: {
    color: '#25D366',
    fontWeight: '600'
  },
  unreadBadge: {
    backgroundColor: '#25D366',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: '#25D366',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});