// screens/HomeScreens/Calls.js
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

export default function Calls({ navigation }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const currentUser = auth.currentUser;

  const loadCalls = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('calls')
        .select(`
          *,
          caller:users!calls_caller_id_fkey(name, avatar, email),
          receiver:users!calls_receiver_id_fkey(name, avatar, email)
        `)
        .or(`caller_id.eq.${currentUser.uid},receiver_id.eq.${currentUser.uid}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCalls(data || []);
    } catch (e) {
      console.log('loadCalls error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalls();

    const channel = supabase
      .channel('callsRealtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, () => {
        loadCalls();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const startCall = (contact, type) => {
    Alert.alert(
      'Appeler',
      `Appeler ${contact.name || contact.email} en ${type === 'video' ? 'vidéo' : 'audio'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Appeler',
          onPress: async () => {
            try {
              const { error } = await supabase.from('calls').insert([{
                caller_id: currentUser.uid,
                receiver_id: contact.id,
                type: type,
                status: 'calling',
                duration: 0
              }]);

              if (error) throw error;
              
              // lehni najem nintegri WebRTC pour les vrais appels
              Alert.alert('Appel en cours', 'Fonctionnalité en développement');
            } catch (e) {
              console.log('startCall error', e);
              Alert.alert('Erreur', 'Impossible de passer l\'appel');
            }
          }
        }
      ]
    );
  };

  const renderCallItem = ({ item }) => {
    const isOutgoing = item.caller_id === currentUser.uid;
    const contact = isOutgoing ? item.receiver : item.caller;
    const callTime = new Date(item.created_at);
    const now = new Date();
    const diffMs = now - callTime;
    const diffMins = Math.floor(diffMs / 60000);
    
    let timeAgo = '';
    if (diffMins < 1) timeAgo = 'À l\'instant';
    else if (diffMins < 60) timeAgo = `Il y a ${diffMins} min`;
    else if (diffMins < 1440) timeAgo = `Il y a ${Math.floor(diffMins / 60)} h`;
    else timeAgo = `Il y a ${Math.floor(diffMins / 1440)} j`;

    return (
      <TouchableOpacity 
        style={styles.row}
        onPress={() => startCall(contact, item.type)}
      >
        {contact?.avatar ? (
          <Image source={{ uri: contact.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={32} color="#999" />
          </View>
        )}
        <View style={{flex:1}}>
          <Text style={styles.name}>{contact?.name || contact?.email}</Text>
          <View style={styles.callInfo}>
            <Ionicons 
              name={isOutgoing ? 'call-outline' : 'arrow-down'} 
              size={16} 
              color={item.status === 'missed' ? 'red' : '#666'} 
            />
            <Text style={[
              styles.callType,
              item.status === 'missed' && styles.missedText
            ]}>
              {item.status === 'missed' ? 'Manqué' : timeAgo}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          onPress={() => startCall(contact, item.type)}
          style={styles.callBtn}
        >
          <Ionicons 
            name={item.type === 'video' ? 'videocam' : 'call'} 
            size={24} 
            color="#25D366" 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return <ActivityIndicator style={{flex:1}} size="large" color="#25D366" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Appels</Text>
      </View>

      <FlatList
        data={calls}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderCallItem}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="call-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Aucun appel</Text>
            <Text style={styles.emptySubtext}>
              Appuyez sur l'icône d'appel dans un chat pour démarrer
            </Text>
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
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  name: { fontSize: 16, fontWeight: '700', color: '#000' },
  callInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  callType: {
    fontSize: 13,
    color: '#666',
    marginLeft: 4,
  },
  missedText: {
    color: 'red',
  },
  callBtn: {
    padding: 8,
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
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'center',
  },
});