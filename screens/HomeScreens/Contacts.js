// screens/HomeScreens/Contacts.js
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

export default function Contacts({ navigation }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentUser = auth.currentUser;

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .neq('id', currentUser ? currentUser.uid : '');
      if (error) throw error;
      setContacts(data || []);
    } catch (e) {
      console.log('loadContacts error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();

    const channel = supabase
      .channel('users_realtime_all')
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'users' 
      }, (payload) => {
        setContacts((prev) => 
          prev.map((u) => u.id === payload.new.id ? {...u, ...payload.new} : u)
        );
      })
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'users' 
      }, (payload) => {
        setContacts((prev) => [...prev, payload.new]);
      })
      .on('postgres_changes', { 
        event: 'DELETE', 
        schema: 'public', 
        table: 'users' 
      }, (payload) => {
        setContacts((prev) => prev.filter((u) => u.id !== payload.old.id));
      })
      .subscribe((status) => {
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openChat = (contact) => {
    if (!currentUser) return Alert.alert('Erreur', 'Utilisateur non connecté');
    const id1 = currentUser.uid;
    const id2 = contact.id;
    const chatKey = id1 > id2 ? `${id1}_${id2}` : `${id2}_${id1}`;
    navigation.navigate('ChatScreen', { contact, chatKey });
  };

  if (loading) return <ActivityIndicator style={{flex:1, justifyContent:'center'}} size="large" color="#25D366" />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Contacts</Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openChat(item)}>
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
              <Text style={styles.name}>{item.name || item.email}</Text>
              <Text style={styles.sub}>
                {item.is_online ? 'En ligne' : 'Hors ligne'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Aucun contact</Text>
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
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  row: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 12, 
    paddingHorizontal: 16,
    borderBottomWidth: 1, 
    borderColor: '#f0f0f0' 
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
  name: { fontSize: 16, fontWeight: '700', color: '#000' },
  sub: { color: '#666', fontSize: 13, marginTop: 2 },
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
});