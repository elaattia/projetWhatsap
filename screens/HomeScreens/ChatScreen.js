// screens/HomeScreens/ChatScreen.js
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, ImageBackground,KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { sendPushNotification } from '../../services/notificationService';
import { resetUserActivity } from '../../utils/activityTracker';

export default function ChatScreen({ route, navigation }) {
  const { contact: initialContact, chatKey } = route.params;
  const currentUser = auth.currentUser;

  const [contact, setContact] = useState(initialContact);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);

  const flatRef = useRef();
  const typingTimeoutRef = useRef(null);
  const otherUserTypingTimeoutRef = useRef(null);
  const typingChannelRef = useRef(null); 

  const loadMessages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_key', chatKey)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
      setTimeout(() => flatRef.current?.scrollToEnd?.({ animated: true }), 200);
    } catch (e) {
      console.log('loadMessages', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();

    
    const userStatusChannel = supabase
      .channel(`user_status_${contact.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${contact.id}`
        },
        (payload) => {
          
          setContact(prev => ({...prev, ...payload.new}));
        }
      )
      .subscribe((status) => {
        
      });

   
    const messagesChannel = supabase
      .channel(`messages_${chatKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_key=eq.${chatKey}`
        },
        (payload) => {
          const newMessage = payload.new;
          
          setMessages((prev) => {
            const exists = prev.some(m => 
              m.message === newMessage.message && 
              m.sender_id === newMessage.sender_id &&
              Math.abs(new Date(m.created_at) - new Date(newMessage.created_at)) < 5000
            );
            
            if (exists) {
              return prev.map(m => 
                m.id?.toString().startsWith('temp_') && 
                m.message === newMessage.message && 
                m.sender_id === newMessage.sender_id 
                  ? newMessage 
                  : m
              );
            }
            
            return [...prev, newMessage];
          });
          
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    
    const typingChannel = supabase
      .channel(`typing_${chatKey}`, {
        config: {
          broadcast: { self: false } 
        }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        
        if (payload.payload.userId !== currentUser.uid) {
          
          setOtherUserTyping(true);
          
          if (otherUserTypingTimeoutRef.current) {
            clearTimeout(otherUserTypingTimeoutRef.current);
          }
          
          otherUserTypingTimeoutRef.current = setTimeout(() => {
            
            setOtherUserTyping(false);
          }, 3000);
        }
      })
      .subscribe((status) => {
        
        if (status === 'SUBSCRIBED') {
          typingChannelRef.current = typingChannel;
        }
      });

    return () => {
      
      supabase.removeChannel(userStatusChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(typingChannel);
      
      if (otherUserTypingTimeoutRef.current) {
        clearTimeout(otherUserTypingTimeoutRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [chatKey, contact.id]);

  const handleTextChange = async (newText) => {
    setText(newText);
    resetUserActivity();
    
   
    if (newText.length > 0 && !isTyping && typingChannelRef.current) {
      setIsTyping(true);
      
      await typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUser.uid, timestamp: Date.now() }
      });
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 2000);
  };

  const sendText = async () => {
    if (!text.trim()) return;
    
    resetUserActivity();
    
    const messageText = text.trim();
    setText('');
    
    const optimisticMessage = {
      id: `temp_${Date.now()}`,
      chat_key: chatKey,
      sender_id: currentUser.uid,
      receiver_id: contact.id,
      message: messageText,
      image_url: null,
      created_at: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    
    try {
      setSending(true);
      const { error } = await supabase.from('messages').insert([{
        chat_key: chatKey,
        sender_id: currentUser.uid,
        receiver_id: contact.id,
        message: messageText,
        image_url: null
      }]);
      
      if (error) throw error;

      if (contact.push_token) {
        console.log('Notification désactivée:', messageText);
      }
    } catch (e) {
      console.log('sendText', e);
      alert('Erreur envoi: ' + e.message);
      setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
    } finally {
      setSending(false);
    }
  };

  const pickAndSendImage = async () => {
    resetUserActivity();
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission refusée');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    
    try {
      setSending(true);
      
      
      const fileName = `${chatKey}_${currentUser.uid}_${Date.now()}.jpg`;
      const filePath = `chat/${fileName}`;
      
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileData = new Uint8Array(arrayBuffer);
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat')
        .upload(filePath, fileData, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.log("Erreur upload:", uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('chat')
        .getPublicUrl(filePath);

      const url = urlData.publicUrl;
      console.log("Image URL:", url);

      const optimisticMessage = {
        id: `temp_${Date.now()}`,
        chat_key: chatKey,
        sender_id: currentUser.uid,
        receiver_id: contact.id,
        message: null,
        image_url: url,
        created_at: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

      const { error } = await supabase.from('messages').insert([{
        chat_key: chatKey,
        sender_id: currentUser.uid,
        receiver_id: contact.id,
        message: null,
        image_url: url
      }]);

      if (error) {
        console.log("Erreur insert message:", error);
        setMessages(prev => prev.filter(m => m.id !== optimisticMessage.id));
        throw error;
      }

    
    } catch (e) {
      console.log('pickAndSendImage', e);
      alert('Erreur upload image: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const initiateCall = async (type) => {
    resetUserActivity();
    
    try {
      const { error } = await supabase.from('calls').insert([{
        caller_id: currentUser.uid,
        receiver_id: contact.id,
        type: type,
        status: 'calling',
        duration: 0
      }]);

      if (error) throw error;

      if (contact.push_token) {
        await sendPushNotification(
          contact.push_token,
          `Appel ${type === 'video' ? 'vidéo' : 'audio'}`,
          `${currentUser.displayName || 'Un contact'} vous appelle`,
          {
            type: 'call',
            callType: type
          }
        );
      }

      alert(`Appel ${type} en cours...`);
    } catch (e) {
      console.log('initiateCall error', e);
      alert('Erreur appel');
    }
  };

  const renderItem = ({ item }) => {
    const isMe = item.sender_id === currentUser.uid;
    const isOptimistic = item.id?.toString().startsWith('temp_');
    
    return (
      <View style={[styles.msgRow, isMe ? styles.meRow : styles.themRow]}>
        {item.image_url ? (
          <View style={{ position: 'relative' }}>
            <Image 
              source={{ uri: item.image_url }} 
              style={[styles.msgImage, isMe ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]} 
            />
            {isOptimistic && (
              <View style={styles.sendingOverlay}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
            <Text style={[isMe ? { color: '#fff' } : { color: '#000' }]}>{item.message}</Text>
            {isOptimistic && (
              <Ionicons name="time-outline" size={12} color={isMe ? '#fff' : '#999'} style={{ marginLeft: 4 }} />
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        
        {contact.avatar ? (
          <Image source={{ uri: contact.avatar }} style={styles.headerAvatar} />
        ) : (
          <View style={[styles.headerAvatar, { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="person" size={24} color="#fff" />
          </View>
        )}
        
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{contact.name || contact.email}</Text>
          
          {otherUserTyping ? (
            <Text style={styles.typingText}>✍️ en train d'écrire...</Text>
          ) : (
            <Text style={styles.headerStatus}>
              {contact.is_online ? 'En ligne' : 'Hors ligne'}
            </Text>
          )}
        </View>

        <TouchableOpacity onPress={() => initiateCall('video')} style={styles.headerBtn}>
          <Ionicons name="videocam" size={24} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => initiateCall('audio')} style={styles.headerBtn}>
          <Ionicons name="call" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ImageBackground 
        source={require('../../assets/backimg.jpg')}
        style={styles.container}
        resizeMode="cover"
      >
        <View style={styles.overlay} />
        
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#25D366" />
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(item) => item.id?.toString() || item.created_at}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
            onContentSizeChange={() => flatRef.current?.scrollToEnd?.({ animated: true })}
            onLayout={() => flatRef.current?.scrollToEnd?.({ animated: true })}
          />
        )}
      </ImageBackground>

      <View style={styles.composer}>
        <TouchableOpacity onPress={pickAndSendImage} style={styles.iconBtn}>
          <Ionicons name="image" size={24} color="#666" />
        </TouchableOpacity>

        <TextInput
          placeholder="Message..."
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          multiline
        />

        <TouchableOpacity 
          onPress={sendText} 
          style={[styles.sendBtn, sending ? { opacity: 0.6 } : {}]}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { 
    height: 70, 
    backgroundColor: '#25D366', 
    flexDirection: 'row',
    alignItems: 'center', 
    paddingHorizontal: 12,
    paddingTop: 20
  },
  backBtn: { padding: 8, marginRight: 4 },
  headerAvatar: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    marginRight: 12,
    backgroundColor: '#fff'
  },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16 },
  headerStatus: { color: '#e8f5e9', fontSize: 12 },
  typingText: { 
    color: '#FFF', 
    fontSize: 12, 
    fontStyle: 'italic',
    fontWeight: '500'
  },
  headerBtn: { padding: 8, marginLeft: 4 },
  container: { 
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  msgRow: { marginVertical: 4 },
  meRow: { alignItems: 'flex-end' },
  themRow: { alignItems: 'flex-start' },
  bubble: { 
    maxWidth: '80%', 
    padding: 10, 
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  bubbleMe: { 
    backgroundColor: '#519e63ff', 
    borderBottomRightRadius: 4 
  },
  bubbleThem: { 
    backgroundColor: '#666866ff', 
    borderBottomLeftRadius: 4 
  },
  composer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 8, 
    backgroundColor: '#f0f0f0',
    borderTopWidth: 1,
    borderColor: '#ddd'
  },
  input: { 
    flex: 1, 
    backgroundColor: '#fff', 
    padding: 10, 
    borderRadius: 20, 
    marginHorizontal: 8,
    maxHeight: 100
  },
  sendBtn: { 
    backgroundColor: '#25D366', 
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
  iconBtn: { padding: 8 },
  msgImage: { 
    width: 200, 
    height: 200, 
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  sendingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  }
});