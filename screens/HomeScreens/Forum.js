// screens/HomeScreens/Forum.js (avec AsyncStorage)
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, ActivityIndicator, TextInput, Modal, Alert, KeyboardAvoidingView, Platform, ScrollView, RefreshControl } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../config/supabaseClient';
import { auth } from '../../config/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import CacheService from '../../services/cacheService';

export default function Forum({ navigation }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingPost, setEditingPost] = useState(null);

  const currentUser = auth.currentUser;
  const flatRef = useRef();

  const loadPosts = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        setLoading(true);
        
        // 1. Charger depuis le cache d'abord
        const cachedPosts = await CacheService.getCachedForumPosts();
        
        if (cachedPosts) {
          console.log('Posts forum chargés depuis le cache');
          setPosts(cachedPosts);
          setLoading(false);
        }
      }

      // 2. Charger depuis Supabase (en arrière-plan si cache disponible)
      const { data, error } = await supabase
        .from('forum_posts')
        .select(`
          *,
          users (name, avatar, email)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // 3. Récupérer les likes de l'utilisateur
      const { data: userLikes, error: likesError } = await supabase
        .from('forum_likes')
        .select('post_id')
        .eq('user_id', currentUser.uid);

      if (likesError) throw likesError;

      const likedPostIds = new Set(userLikes.map(like => like.post_id));

      const postsWithLikeStatus = data.map(post => ({
        ...post,
        isLiked: likedPostIds.has(post.id)
      }));

      // 4. Mettre à jour le cache et l'interface
      await CacheService.cacheForumPosts(postsWithLikeStatus);
      setPosts(postsWithLikeStatus);
      
    } catch (e) {
      console.log('loadPosts error', e);
      if (!posts.length) {
        Alert.alert('Erreur', 'Impossible de charger les posts');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPosts(true);
  };

  useEffect(() => {
    loadPosts();

    const postsChannel = supabase
      .channel('forum_posts_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'forum_posts' },
        () => {
          loadPosts(true);
        }
      )
      .subscribe();

    const likesChannel = supabase
      .channel('forum_likes_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'forum_likes' },
        () => {
          loadPosts(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(likesChannel);
    };
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorisez l\'accès à la galerie');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const openCreateModal = () => {
    setEditingPost(null);
    setTitle('');
    setContent('');
    setSelectedImage(null);
    setModalVisible(true);
  };

  const openEditModal = (post) => {
    setEditingPost(post);
    setTitle(post.title);
    setContent(post.content);
    setSelectedImage(post.image_url);
    setModalVisible(true);
  };

  const savePost = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Erreur', 'Le titre et le contenu sont obligatoires');
      return;
    }

    setUploading(true);

    try {
      let imageUrl = selectedImage;

      if (selectedImage && selectedImage.startsWith('file://')) {
        const uriParts = selectedImage.split('.');
        const fileExtension = uriParts[uriParts.length - 1].toLowerCase();
        
        let mimeType = 'image/jpeg';
        if (fileExtension === 'png') mimeType = 'image/png';
        else if (fileExtension === 'gif') mimeType = 'image/gif';
        else if (fileExtension === 'webp') mimeType = 'image/webp';
        
        const fileName = `${currentUser.uid}_${Date.now()}.${fileExtension}`;
        const filePath = `posts/${fileName}`;

        const response = await fetch(selectedImage);
        const arrayBuffer = await response.arrayBuffer();
        const fileData = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
          .from('forum')
          .upload(filePath, fileData, {
            contentType: mimeType,
            upsert: true
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('forum')
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      if (editingPost) {
        const { error } = await supabase
          .from('forum_posts')
          .update({
            title: title.trim(),
            content: content.trim(),
            image_url: imageUrl
          })
          .eq('id', editingPost.id)
          .eq('user_id', currentUser.uid);

        if (error) throw error;
        
        Alert.alert('Succès', 'Post modifié !');
      } else {
        const { error } = await supabase
          .from('forum_posts')
          .insert([{
            user_id: currentUser.uid,
            title: title.trim(),
            content: content.trim(),
            image_url: imageUrl,
            likes_count: 0,
            comments_count: 0
          }]);

        if (error) throw error;
        
        Alert.alert('Succès', 'Post publié !');
      }

      setModalVisible(false);
      setTitle('');
      setContent('');
      setSelectedImage(null);
      setEditingPost(null);
      
      // Forcer le rechargement et mise à jour du cache
      await loadPosts(true);
      
    } catch (e) {
      console.log('savePost error', e);
      Alert.alert('Erreur', 'Impossible de sauvegarder le post: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleLike = async (post) => {
    try {
      if (post.isLiked) {
        const { error: deleteError } = await supabase
          .from('forum_likes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', currentUser.uid);

        if (deleteError) throw deleteError;

        const newCount = Math.max(0, (post.likes_count || 0) - 1);
        const { error: updateError } = await supabase
          .from('forum_posts')
          .update({ likes_count: newCount })
          .eq('id', post.id);

        if (updateError) throw updateError;

      } else {
        const { error: insertError } = await supabase
          .from('forum_likes')
          .insert([{
            post_id: post.id,
            user_id: currentUser.uid
          }]);

        if (insertError) throw insertError;

        const newCount = (post.likes_count || 0) + 1;
        const { error: updateError } = await supabase
          .from('forum_posts')
          .update({ likes_count: newCount })
          .eq('id', post.id);

        if (updateError) throw updateError;
      }

      // Recharger et mettre à jour le cache
      await loadPosts(true);
      
    } catch (e) {
      console.log('toggleLike error', e);
      Alert.alert('Erreur', 'Impossible de liker le post: ' + e.message);
    }
  };

  const deletePost = (post) => {
    if (post.user_id !== currentUser.uid) {
      Alert.alert('Erreur', 'Vous ne pouvez supprimer que vos propres posts');
      return;
    }

    Alert.alert(
      'Supprimer',
      'Êtes-vous sûr de vouloir supprimer ce post ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              // Supprimer les likes
              await supabase
                .from('forum_likes')
                .delete()
                .eq('post_id', post.id);

              // Supprimer les commentaires
              await supabase
                .from('forum_comments')
                .delete()
                .eq('post_id', post.id);

              // Supprimer l'image si elle existe
              if (post.image_url && post.image_url.includes('forum/posts/')) {
                try {
                  const urlParts = post.image_url.split('forum/posts/');
                  if (urlParts.length > 1) {
                    const imagePath = urlParts[1].split('?')[0];
                    await supabase.storage
                      .from('forum')
                      .remove([`posts/${imagePath}`]);
                  }
                } catch (storageErr) {
                  console.log('Error deleting image:', storageErr);
                }
              }

              // Supprimer le post
              const { error: postError } = await supabase
                .from('forum_posts')
                .delete()
                .eq('id', post.id)
                .eq('user_id', currentUser.uid);

              if (postError) throw postError;
              
              Alert.alert('Succès', 'Post supprimé');
              
              // Recharger et mettre à jour le cache
              await loadPosts(true);
              
            } catch (e) {
              console.log('deletePost error', e);
              Alert.alert('Erreur', 'Impossible de supprimer le post: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const openComments = (post) => {
    navigation.navigate('ForumComments', { post });
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

  const renderPost = ({ item }) => {
    const isMyPost = item.user_id === currentUser.uid;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <View style={styles.userInfo}>
            {item.users?.avatar ? (
              <Image source={{ uri: item.users.avatar }} style={styles.userAvatar} />
            ) : (
              <View style={[styles.userAvatar, styles.defaultAvatar]}>
                <Ionicons name="person" size={20} color="#999" />
              </View>
            )}
            <View>
              <Text style={styles.userName}>{item.users?.name || item.users?.email}</Text>
              <Text style={styles.postTime}>{getTimeAgo(item.created_at)}</Text>
            </View>
          </View>
          
          {isMyPost && (
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => openEditModal(item)} style={styles.editBtn}>
                <Ionicons name="create-outline" size={20} color="#25D366" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deletePost(item)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={20} color="#f44336" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <Text style={styles.postTitle}>{item.title}</Text>
        <Text style={styles.postContent}>{item.content}</Text>

        {item.image_url && (
          <Image source={{ uri: item.image_url }} style={styles.postImage} />
        )}

        <View style={styles.postActionsBar}>
          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => toggleLike(item)}
          >
            <Ionicons 
              name={item.isLiked ? 'heart' : 'heart-outline'} 
              size={22} 
              color={item.isLiked ? '#f44336' : '#666'} 
            />
            <Text style={styles.actionText}>{Math.max(0, item.likes_count || 0)}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionBtn} 
            onPress={() => openComments(item)}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#666" />
            <Text style={styles.actionText}>{Math.max(0, item.comments_count || 0)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="share-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading && !posts.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Forum</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={openCreateModal} style={styles.addBtn}>
            <Ionicons name="add-circle" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderPost}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#25D366']}
            tintColor="#25D366"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>Aucun post</Text>
            <Text style={styles.emptySubtext}>
              Soyez le premier à publier !
            </Text>
            <TouchableOpacity onPress={openCreateModal} style={styles.createFirstBtn}>
              <Text style={styles.createFirstText}>Créer un post</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>
                {editingPost ? 'Modifier le post' : 'Nouveau post'}
              </Text>
              <TouchableOpacity 
                onPress={savePost}
                disabled={uploading || !title.trim() || !content.trim()}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#25D366" />
                ) : (
                  <Text style={[
                    styles.publishBtn,
                    (!title.trim() || !content.trim()) && styles.publishBtnDisabled
                  ]}>
                    {editingPost ? 'Modifier' : 'Publier'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <TextInput
                style={styles.titleInput}
                placeholder="Titre du post"
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />

              <TextInput
                style={styles.contentInput}
                placeholder="Partagez vos pensées..."
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
              />

              {selectedImage && (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                  <TouchableOpacity 
                    style={styles.removeImageBtn}
                    onPress={() => setSelectedImage(null)}
                  >
                    <Ionicons name="close-circle" size={28} color="#f44336" />
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                <Ionicons name="image-outline" size={24} color="#25D366" />
                <Text style={styles.imagePickerText}>
                  {selectedImage ? 'Changer l\'image' : 'Ajouter une image'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#25D366',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  refreshBtn: { padding: 4 },
  addBtn: { padding: 4 },
  listContent: { padding: 12 },
  postCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
  },
  defaultAvatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  userName: { fontSize: 15, fontWeight: '700', color: '#000' },
  postTime: { fontSize: 12, color: '#999', marginTop: 2 },
  postActions: { flexDirection: 'row', gap: 8 },
  editBtn: { padding: 4 },
  deleteBtn: { padding: 4 },
  postTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  postContent: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
  },
  postImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
  },
  postActionsBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderColor: '#f0f0f0',
    paddingTop: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
    fontWeight: '600',
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
  createFirstBtn: {
    marginTop: 20,
    backgroundColor: '#25D366',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createFirstText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#000' },
  publishBtn: { fontSize: 16, fontWeight: '700', color: '#25D366' },
  publishBtnDisabled: { color: '#ccc' },
  modalContent: { flex: 1, padding: 16 },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 12,
  },
  contentInput: {
    fontSize: 16,
    color: '#333',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    minHeight: 150,
    marginBottom: 12,
  },
  imagePreviewContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  imagePreview: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  removeImageBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  imagePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#25D366',
    borderStyle: 'dashed',
  },
  imagePickerText: {
    fontSize: 16,
    color: '#25D366',
    fontWeight: '600',
    marginLeft: 8,
  },
});