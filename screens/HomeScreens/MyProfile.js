// screens/HomeScreens/MyProfile.js (VERSION SUPABASE STORAGE + DELETE ACCOUNT)
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Modal } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { auth } from "../../config/firebaseConfig";
import { supabase } from "../../config/supabaseClient";
import { signOut, EmailAuthProvider, reauthenticateWithCredential, deleteUser } from "firebase/auth";
import { Ionicons } from '@expo/vector-icons';

export default function MyProfile() {
  const user = auth.currentUser;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [phone, setPhone] = useState("");
  const [image, setImage] = useState(null);

  // Modal suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [passwordForDelete, setPasswordForDelete] = useState("");

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.uid)
        .single();

      if (error) {
        console.log("Erreur load profile:", error);
      } else {
        setProfile(data);
        setName(data.name || "");
        setPseudo(data.pseudo || "");
        setPhone(data.phone || "");
        setImage(data.avatar || null);
      }
    } catch (e) {
      console.log("Exception load profile:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission refusée", "Autorisez l'accès à la galerie");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled) {
      uploadImageToSupabase(result.assets[0].uri);
    }
  };

  const uploadImageToSupabase = async (uri) => {
    setUploadingImage(true);
    
    try {
      console.log("Début upload Supabase...");
      
      const uriParts = uri.split('.');
      const fileExtension = uriParts[uriParts.length - 1].toLowerCase();
      
      let mimeType = 'image/jpeg';
      if (fileExtension === 'png') mimeType = 'image/png';
      else if (fileExtension === 'jpg' || fileExtension === 'jpeg') mimeType = 'image/jpeg';
      else if (fileExtension === 'gif') mimeType = 'image/gif';
      else if (fileExtension === 'webp') mimeType = 'image/webp';
      
      const fileName = `${user.uid}_${Date.now()}.${fileExtension}`;
      const filePath = `avatars/${fileName}`;
      
      console.log(`Upload fichier: ${fileName} (${mimeType})`);
      
      console.log("Création FormData...");
      const formData = new FormData();
      
      const uriPathParts = uri.split('/');
      const fileNameFromUri = uriPathParts[uriPathParts.length - 1];
      
      formData.append('file', {
        uri: uri,
        name: fileNameFromUri,
        type: mimeType
      });
      
      console.log("Upload vers Supabase Storage...");
      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, formData, {
          contentType: mimeType,
          upsert: true
        });

      if (uploadError) {
        console.log("Erreur upload:", uploadError);
        throw uploadError;
      }

      console.log("Récupération URL publique...");
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicURL = urlData.publicUrl;
      console.log("URL obtenue:", publicURL);
      
      setImage(publicURL);

      console.log("Mise à jour DB...");
      const { error: updateError } = await supabase
        .from("users")
        .update({ avatar: publicURL })
        .eq("id", user.uid);

      if (updateError) {
        console.log("Erreur update avatar:", updateError);
        Alert.alert("Erreur", "Impossible de mettre à jour l'avatar");
      } else {
        console.log("Succès !");
        Alert.alert("Succès", "Photo mise à jour !");
      }
    } catch (e) {
      console.log("Erreur upload image:", e);
      Alert.alert("Erreur", `Impossible d'uploader l'image: ${e.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      Alert.alert("Erreur", "Le nom est obligatoire");
      return;
    }

    setUpdating(true);

    try {
      const { error } = await supabase
        .from("users")
        .update({
          name: name.trim(),
          pseudo: pseudo.trim(),
          phone: phone.trim(),
        })
        .eq("id", user.uid);

      if (error) {
        console.log("Erreur save profile:", error);
        Alert.alert("Erreur", error.message);
      } else {
        Alert.alert("Succès", "Profil mis à jour !");
      }
    } catch (e) {
      console.log("Exception save profile:", e);
      Alert.alert("Erreur", "Une erreur est survenue");
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Déconnexion",
      "Voulez-vous vraiment vous déconnecter ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Déconnexion",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut(auth);
            } catch (e) {
              console.log("Erreur logout:", e);
              Alert.alert("Erreur", "Impossible de se déconnecter");
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccount = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteAccount = async () => {
    if (!passwordForDelete.trim()) {
      Alert.alert("Erreur", "Veuillez entrer votre mot de passe");
      return;
    }

    setDeleting(true);

    try {
      // 1. Réauthentification
      const credential = EmailAuthProvider.credential(user.email, passwordForDelete);
      await reauthenticateWithCredential(user, credential);

      // 2. Supprimer les données Supabase
      const { error: supabaseError } = await supabase
        .from("users")
        .delete()
        .eq("id", user.uid);

      if (supabaseError) {
        console.log("Erreur suppression Supabase:", supabaseError);
        Alert.alert("Erreur", "Impossible de supprimer les données");
        setDeleting(false);
        return;
      }

      // 3. Supprimer l'avatar du storage (optionnel)
      if (image) {
        try {
          const fileName = image.split('/').pop();
          await supabase.storage.from('avatars').remove([`avatars/${fileName}`]);
        } catch (e) {
          console.log("Erreur suppression avatar:", e);
        }
      }

      // 4. Supprimer le compte Firebase
      await deleteUser(user);

      Alert.alert("Compte supprimé", "Votre compte a été supprimé avec succès");
      setShowDeleteModal(false);
      setPasswordForDelete("");
      
    } catch (e) {
      console.log("Erreur suppression compte:", e);
      
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        Alert.alert("Erreur", "Mot de passe incorrect");
      } else if (e.code === "auth/requires-recent-login") {
        Alert.alert("Erreur", "Pour des raisons de sécurité, veuillez vous reconnecter avant de supprimer votre compte");
      } else {
        Alert.alert("Erreur", "Impossible de supprimer le compte: " + e.message);
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#25D366" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Mon Profil</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Photo */}
      <TouchableOpacity onPress={pickImage} disabled={uploadingImage}>
        <View style={styles.avatarContainer}>
          {image ? (
            <Image source={{ uri: image }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={60} color="#999" />
            </View>
          )}
          {uploadingImage && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
        </View>
        <Text style={styles.changePhoto}>
          {uploadingImage ? "Upload en cours..." : "Changer la photo"}
        </Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <View style={styles.disabledInput}>
          <Text style={styles.disabledText}>{user?.email}</Text>
        </View>

        <Text style={styles.label}>Nom complet *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Votre nom"
        />

        <Text style={styles.label}>Pseudo</Text>
        <TextInput
          style={styles.input}
          value={pseudo}
          onChangeText={setPseudo}
          placeholder="@pseudo"
        />

        <Text style={styles.label}>Numéro</Text>
        <TextInput
          style={styles.input}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholder="+216 XX XXX XXX"
        />

        <TouchableOpacity 
          style={[styles.btn, updating && styles.btnDisabled]} 
          onPress={saveProfile}
          disabled={updating}
        >
          {updating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Section Déconnexion et Suppression */}
      <View style={styles.actionSection}>
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={22} color="#fff" style={styles.btnIcon} />
          <Text style={styles.logoutButtonText}>Déconnexion</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={22} color="#fff" style={styles.btnIcon} />
          <Text style={styles.deleteButtonText}>Supprimer mon compte</Text>
        </TouchableOpacity>
      </View>

      {/* Modal de confirmation de suppression */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={50} color="#dc3545" />
              <Text style={styles.modalTitle}>Supprimer le compte</Text>
            </View>

            <Text style={styles.modalText}>
              Cette action est irréversible. Toutes vos données seront définitivement supprimées.
            </Text>

            <Text style={styles.modalLabel}>Confirmez votre mot de passe :</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Mot de passe"
              value={passwordForDelete}
              onChangeText={setPasswordForDelete}
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setPasswordForDelete("");
                }}
                disabled={deleting}
              >
                <Text style={styles.modalBtnCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={confirmDeleteAccount}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnDeleteText}>Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  center: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  header: {
    backgroundColor: "#25D366",
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "bold",
  },
  logoutBtn: {
    padding: 8,
  },
  avatarContainer: {
    alignSelf: "center",
    marginTop: 30,
    marginBottom: 10,
    position: "relative",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: "#25D366",
  },
  uploadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  changePhoto: {
    textAlign: "center",
    marginTop: 8,
    color: "#25D366",
    fontWeight: "bold",
    fontSize: 16,
  },
  card: {
    margin: 20,
    backgroundColor: "#fff",
    borderRadius: 15,
    padding: 20,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  label: {
    color: "#444",
    marginTop: 15,
    marginBottom: 6,
    fontWeight: "600",
    fontSize: 14,
  },
  input: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  disabledInput: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  disabledText: {
    color: "#999",
    fontSize: 16,
  },
  btn: {
    backgroundColor: "#25D366",
    padding: 14,
    borderRadius: 10,
    marginTop: 25,
  },
  btnDisabled: {
    backgroundColor: "#999",
  },
  btnText: {
    textAlign: "center",
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  // Section Actions
  actionSection: {
    marginHorizontal: 20,
    marginTop: 10,
    gap: 12,
  },
  logoutButton: {
    backgroundColor: "#FF9500",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  btnIcon: {
    marginRight: 8,
  },
  logoutButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  deleteButton: {
    backgroundColor: "#dc3545",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 25,
    width: "85%",
    maxWidth: 400,
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
  },
  modalText: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#444",
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: "#f0f0f0",
  },
  modalBtnCancelText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "600",
  },
  modalBtnDelete: {
    backgroundColor: "#dc3545",
  },
  modalBtnDeleteText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});