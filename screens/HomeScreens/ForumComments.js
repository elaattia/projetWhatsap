// screens/HomeScreens/ForumComments.js
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Image, KeyboardAvoidingView, Platform,ActivityIndicator,Alert} from 'react-native';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';

export default function ForumComments({ route, navigation }) {
  const { post } = route.params;
  const currentUser = auth.currentUser;

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);

  const flatRef = useRef();

  const loadComments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('forum_comments')
        .select(`
          *,
          users (name, avatar, email)
        `)
        .eq('post_id', post.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
      
      setCommentsCount(data?.length || 0);
      
      setTimeout(() => flatRef.current?.scrollToEnd?.({ animated: true }), 200);
    } catch (e) {
      console.log('loadComments error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();

    const channel = supabase
      .channel(`forum_comments_${post.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'forum_comments',
          filter: `post_id=eq.${post.id}`
        },
        async (payload) => {
          const { data: userData } = await supabase
            .from('users')
            .select('name, avatar, email')
            .eq('id', payload.new.user_id)
            .single();
          
          const newComment = {
            ...payload.new,
            users: userData
          };
          
          setComments((prev) => [...prev, newComment]);
          setCommentsCount(prev => prev + 1);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'forum_comments',
          filter: `post_id=eq.${post.id}`
        },
        (payload) => {
          setComments((prev) => prev.filter(c => c.id !== payload.old.id));
          setCommentsCount(prev => Math.max(0, prev - 1));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [post.id]);

  const sendComment = async () => {
    if (!commentText.trim()) return;

    const text = commentText.trim();
    setCommentText('');

    try {
      setSending(true);
      
      const { error } = await supabase
        .from('forum_comments')
        .insert([{
          post_id: post.id,
          user_id: currentUser.uid,
          content: text
        }]);

      if (error) throw error;

      const newCount = commentsCount + 1;
      await supabase
        .from('forum_posts')
        .update({ comments_count: newCount })
        .eq('id', post.id);

    } catch (e) {
      console.log('sendComment error', e);
      Alert.alert('Erreur', 'Impossible d\'envoyer le commentaire');
      setCommentText(text);
    } finally {
      setSending(false);
    }
  };

  const deleteComment = (comment) => {
    if (comment.user_id !== currentUser.uid) {
      Alert.alert('Erreur', 'Vous ne pouvez supprimer que vos propres commentaires');
      return;
    }

    Alert.alert(
      'Supprimer',
      'Êtes-vous sûr de vouloir supprimer ce commentaire ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Deleting comment:', comment.id);
              
              const { error } = await supabase
                .from('forum_comments')
                .delete()
                .eq('id', comment.id)
                .eq('user_id', currentUser.uid);

              if (error) {
                console.log('Delete comment error:', error);
                throw error;
              }

              console.log('Comment deleted successfully');

              const newCount = Math.max(0, commentsCount - 1);
              const { error: updateError } = await supabase
                .from('forum_posts')
                .update({ comments_count: newCount })
                .eq('id', post.id);

              if (updateError) {
                console.log('Update count error:', updateError);
              }

              Alert.alert('Succès', 'Commentaire supprimé');
              
              await loadComments();
              
            } catch (e) {
              console.log('deleteComment error', e);
              Alert.alert('Erreur', 'Impossible de supprimer le commentaire: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const getTimeAgo = (date) => {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffMins < 1440) return `Il y a ${Math.floor(diffMins / 60)} h`;
    return `Il y a ${Math.floor(diffMins / 1440)} j`;
  };

  const renderComment = ({ item }) => {
    const isMyComment = item.user_id === currentUser.uid;

    return (
      <View style={styles.commentCard}>
        <View style={styles.commentHeader}>
          {item.users?.avatar ? (
            <Image source={{ uri: item.users.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.defaultAvatar]}>
              <Ionicons name="person" size={20} color="#999" />
            </View>
          )}
          
          <View style={styles.commentContent}>
            <View style={styles.commentMeta}>
              <Text style={styles.userName}>{item.users?.name || item.users?.email}</Text>
              <Text style={styles.commentTime}>{getTimeAgo(item.created_at)}</Text>
            </View>
            <Text style={styles.commentText}>{item.content}</Text>
          </View>

          {isMyComment && (
            <TouchableOpacity onPress={() => deleteComment(item)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color="#f44336" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Commentaires</Text>
          <Text style={styles.headerSubtitle}>{commentsCount} commentaire{commentsCount > 1 ? 's' : ''}</Text>
        </View>
      </View>

      <View style={styles.originalPost}>
        <Text style={styles.postTitle}>{post.title}</Text>
        <Text style={styles.postContent} numberOfLines={3}>{post.content}</Text>
        {post.image_url && (
          <Image source={{ uri: post.image_url }} style={styles.postImage} />
        )}
      </View>

      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#25D366" />
        ) : (
          <FlatList
            ref={flatRef}
            data={comments}
            keyExtractor={(item) => item.id}
            renderItem={renderComment}
            contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={50} color="#ccc" />
                <Text style={styles.emptyText}>Aucun commentaire</Text>
                <Text style={styles.emptySubtext}>Soyez le premier à commenter</Text>
              </View>
            }
          />
        )}
      </View>

      <View style={styles.composer}>
        <TextInput
          placeholder="Écrivez un commentaire..."
          style={styles.input}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          maxLength={500}
        />

        <TouchableOpacity 
          onPress={sendComment} 
          style={[styles.sendBtn, (sending || !commentText.trim()) && { opacity: 0.6 }]}
          disabled={sending || !commentText.trim()}
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
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  headerSubtitle: { color: '#e8f5e9', fontSize: 13, marginTop: 2 },
  originalPost: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  postContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  postImage: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: '#f0f0f0',
  },
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  commentCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
  },
  defaultAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  commentContent: {
    flex: 1,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginRight: 8,
  },
  commentTime: {
    fontSize: 12,
    color: '#999',
  },
  commentText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  deleteBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#bbb',
    marginTop: 6,
    textAlign: 'center',
  },
  composer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 8, 
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#e0e0e0'
  },
  input: { 
    flex: 1, 
    backgroundColor: '#f5f5f5', 
    padding: 10, 
    borderRadius: 20, 
    marginRight: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: { 
    backgroundColor: '#25D366', 
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
});