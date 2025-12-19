// screens/HomeScreens/ChatScreen.js (CORRIGÉ)
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, ImageBackground, KeyboardAvoidingView, Platform, ActivityIndicator, Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { sendPushNotification } from '../../services/notificationService';
import { resetUserActivity } from '../../utils/activityTracker';
import CacheService from '../../services/cacheService';

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, []);

  const animateOpacity = (dot) => ({
    opacity: dot.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        translateY: dot.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -3],
        }),
      },
    ],
  });

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.typingDot, animateOpacity(dot1)]} />
      <Animated.View style={[styles.typingDot, animateOpacity(dot2)]} />
      <Animated.View style={[styles.typingDot, animateOpacity(dot3)]} />
    </View>
  );
};

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
  const isMountedRef = useRef(true);

  const markMessagesAsRead = async () => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('chat_key', chatKey)
        .eq('receiver_id', currentUser.uid)
        .eq('is_read', false);

      if (error) throw error;
      console.log(' Messages marqués comme lus');
    } catch (e) {
      console.log(' Erreur markMessagesAsRead:', e);
    }
  };

  const loadMessages = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        setLoading(true);
        
        const cachedMessages = await CacheService.getCachedMessages(chatKey);
        
        if (cachedMessages) {
          console.log(' Messages chargés depuis le cache');
          setMessages(cachedMessages);
          setLoading(false);
          setTimeout(() => flatRef.current?.scrollToEnd?.({ animated: false }), 100);
        }
      }

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_key', chatKey)
        .order('created_at', { ascending: true });
        
      if (error) throw error;

      await CacheService.cacheMessages(chatKey, data || []);
      setMessages(data || []);
      
      await markMessagesAsRead();
      
      setTimeout(() => flatRef.current?.scrollToEnd?.({ animated: true }), 200);
      
    } catch (e) {
      console.log(' loadMessages error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
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
          if (isMountedRef.current) {
            setContact(prev => ({...prev, ...payload.new}));
          }
        }
      )
      .subscribe();


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
        async (payload) => {
          if (!isMountedRef.current) return;
          
          const newMessage = payload.new;
          console.log(' Nouveau message reçu:', newMessage);
          
          setMessages((prev) => {
            const exists = prev.some(m => m.id === newMessage.id);
            
            if (exists) {
              console.log(' Message déjà existe, mise à jour');
              return prev.map(m => 
                m.id?.toString().startsWith('temp_') && 
                m.message === newMessage.message && 
                m.sender_id === newMessage.sender_id 
                  ? newMessage 
                  : m
              );
            } else {
              console.log(' Nouveau message ajouté');
              const updatedMessages = [...prev, newMessage];
              CacheService.cacheMessages(chatKey, updatedMessages);
              return updatedMessages;
            }
          });
          
         
          if (newMessage.receiver_id === currentUser.uid) {
            await markMessagesAsRead();
          }
          
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `chat_key=eq.${chatKey}`
        },
        async (payload) => {
          if (!isMountedRef.current) return;
          
          console.log(' Message mis à jour:', payload.new);
          setMessages((prev) => {
            const updatedMessages = prev.map(m => 
              m.id === payload.new.id ? payload.new : m
            );
            CacheService.cacheMessages(chatKey, updatedMessages);
            return updatedMessages;
          });
        }
      )
      .subscribe((status) => {
        console.log(' Canal messages status:', status);
      });

    const typingRoomName = `typing:${chatKey}`;
    console.log(' Création canal typing:', typingRoomName);
    
    const typingChannel = supabase
      .channel(typingRoomName, {
        config: {
          broadcast: { 
            self: false,
            ack: true 
          }
        }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (!isMountedRef.current) return;
        
        console.log('⌨️ Typing reçu:', payload);
        
        if (payload.payload.userId !== currentUser.uid) {
          console.log(' Autre user est en train d\'écrire');
          setOtherUserTyping(true);
          
          if (otherUserTypingTimeoutRef.current) {
            clearTimeout(otherUserTypingTimeoutRef.current);
          }
          
          otherUserTypingTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              console.log('⏱ Timeout typing');
              setOtherUserTyping(false);
            }
          }, 3000);
        }
      })
      .subscribe((status) => {
        console.log(' Canal typing status:', status);
        if (status === 'SUBSCRIBED') {
          typingChannelRef.current = typingChannel;
          console.log(' Canal typing prêt');
        } else if (status === 'CHANNEL_ERROR') {
          console.error(' Erreur canal typing');
        }
      });

    return () => {
      console.log(' Nettoyage canaux');
      isMountedRef.current = false;
      
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
    
    // Envoyer le signal à chaque frappe si on tape
    if (newText.length > 0 && typingChannelRef.current) {
      if (!isTyping) {
        setIsTyping(true);
        console.log(' Début typing');
      }
      
      try {
        await typingChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { 
            userId: currentUser.uid,
            userName: currentUser.displayName || 'User',
            timestamp: Date.now() 
          }
        });
      } catch (error) {
        console.error(' Erreur envoi typing:', error);
      }
    }
    
    // Réinitialiser le timeout à chaque frappe
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      console.log(' Arrêt typing');
    }, 2000);
  };

  const sendText = async () => {
    if (!text.trim()) return;
    
    resetUserActivity();
    
    const messageText = text.trim();
    setText('');
    setIsTyping(false);
    
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const optimisticMessage = {
      id: tempId,
      chat_key: chatKey,
      sender_id: currentUser.uid,
      receiver_id: contact.id,
      message: messageText,
      image_url: null,
      is_read: false,
      created_at: new Date().toISOString()
    };
    
    const updatedMessages = [...messages, optimisticMessage];
    setMessages(updatedMessages);
    await CacheService.cacheMessages(chatKey, updatedMessages);
    
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    
    try {
      setSending(true);
      console.log(' Envoi message...');
      
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          chat_key: chatKey,
          sender_id: currentUser.uid,
          receiver_id: contact.id,
          message: messageText,
          image_url: null,
          is_read: false
        }])
        .select()
        .single();
      
      if (error) throw error;
      
      console.log(' Message envoyé:', data);
      
      // Remplacer le message optimiste par le vrai
      setMessages(prev => {
        const updated = prev.map(m => 
          m.id === tempId ? data : m
        );
        CacheService.cacheMessages(chatKey, updated);
        return updated;
      });

      // Notification push (si implémentée)
      if (contact.push_token) {
        await sendPushNotification(
          contact.push_token,
          currentUser.displayName || 'Nouveau message',
          messageText,
          {
            type: 'message',
            chatKey: chatKey,
            senderId: currentUser.uid
          }
        );
      }
      
    } catch (e) {
      console.log(' sendText error', e);
      alert('Erreur envoi: ' + e.message);
      const revertedMessages = messages.filter(m => m.id !== tempId);
      setMessages(revertedMessages);
      await CacheService.cacheMessages(chatKey, revertedMessages);
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

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('chat')
        .getPublicUrl(filePath);

      const url = urlData.publicUrl;

      const tempId = `temp_${Date.now()}_${Math.random()}`;
      const optimisticMessage = {
        id: tempId,
        chat_key: chatKey,
        sender_id: currentUser.uid,
        receiver_id: contact.id,
        message: null,
        image_url: url,
        is_read: false,
        created_at: new Date().toISOString()
      };
      
      const updatedMessages = [...messages, optimisticMessage];
      setMessages(updatedMessages);
      await CacheService.cacheMessages(chatKey, updatedMessages);
      
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);

      const { data, error } = await supabase
        .from('messages')
        .insert([{
          chat_key: chatKey,
          sender_id: currentUser.uid,
          receiver_id: contact.id,
          message: null,
          image_url: url,
          is_read: false
        }])
        .select()
        .single();

      if (error) throw error;
      
      setMessages(prev => {
        const updated = prev.map(m => 
          m.id === tempId ? data : m
        );
        CacheService.cacheMessages(chatKey, updated);
        return updated;
      });

    } catch (e) {
      console.log(' pickAndSendImage error', e);
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
      console.log(' initiateCall error', e);
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
            <View style={styles.typingWrapper}>
              <Text style={styles.typingLabel}>en train d'écrire</Text>
              <TypingIndicator />
            </View>
          ) : (
            <Text style={styles.headerStatus}>
              {contact.is_online ? ' En ligne' : ' Hors ligne'}
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
        
        {loading && !messages.length ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#25D366" />
        ) : (
          <>
            <FlatList
              ref={flatRef}
              data={messages}
              keyExtractor={(item) => item.id?.toString() || item.created_at}
              renderItem={renderItem}
              contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
              onContentSizeChange={() => flatRef.current?.scrollToEnd?.({ animated: true })}
              onLayout={() => flatRef.current?.scrollToEnd?.({ animated: false })}
            />
            
            {/* Indicateur de typing dans la zone des messages */}
            {otherUserTyping && (
              <View style={styles.typingBubbleContainer}>
                <View style={styles.typingBubble}>
                  <TypingIndicator />
                </View>
              </View>
            )}
          </>
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
  typingWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typingLabel: {
    color: '#FFF',
    fontSize: 12,
    fontStyle: 'italic',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFF',
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
  },
  typingBubbleContainer: {
    position: 'absolute',
    bottom: 20,
    left: 12,
    right: 0,
    alignItems: 'flex-start',
  },
  typingBubble: {
    backgroundColor: '#666866ff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
});