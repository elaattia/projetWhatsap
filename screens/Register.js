// screens/Register.js
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ImageBackground } from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebaseConfig";
import { supabase } from "../config/supabaseClient";

export default function Register({ navigation }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const register = async () => {
    if (!email.trim() || !name.trim() || !password.trim()) {
      Alert.alert("Erreur", "Tous les champs sont obligatoires");
      return;
    }

    if (!email.includes("@")) {
      Alert.alert("Erreur", "Email invalide");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Erreur", "Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setLoading(true);

    try {
      const res = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const userId = res.user.uid;

      const { error } = await supabase.from("users").insert({
        id: userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        avatar: null,
      });

      if (error) {
        console.log("Erreur Supabase:", error);
        Alert.alert("Erreur", "Impossible de créer le profil");
        return;
      }

    } catch (err) {
      console.log("Erreur Firebase:", err);
      
      if (err.code === "auth/email-already-in-use") {
        Alert.alert("Erreur", "Cet email est déjà utilisé");
      } else if (err.code === "auth/invalid-email") {
        Alert.alert("Erreur", "Format d'email invalide");
      } else if (err.code === "auth/weak-password") {
        Alert.alert("Erreur", "Mot de passe trop faible");
      } else {
        Alert.alert("Erreur", err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground 
      source={require("../assets/backgr.jpg")} 
      style={styles.bg} 
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <View style={styles.container}>
        <Text style={styles.title}>Créer un compte</Text>

        <TextInput 
          placeholder="Nom complet" 
          style={styles.input} 
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholderTextColor="#ccc"
        />

        <TextInput 
          placeholder="Email" 
          style={styles.input} 
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#ccc"
        />

        <TextInput 
          placeholder="Mot de passe (min 6 caractères)" 
          style={styles.input} 
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholderTextColor="#ccc"
        />

        <TouchableOpacity 
          style={[styles.btn, loading && styles.btnDisabled]} 
          onPress={register}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>S'inscrire</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={styles.link}>Déjà un compte ? Se connecter</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  container: { flex: 1, justifyContent: "center", padding: 20 },
  title: { fontSize: 32, marginBottom: 25, fontWeight: "bold", textAlign: "center", color: "#fff" },
  input: { 
    backgroundColor: "rgba(255,255,255,0.1)", 
    padding: 15, 
    borderRadius: 10, 
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    color: "#fff",
    fontSize: 16
  },
  btn: { backgroundColor: "#25D366", padding: 15, borderRadius: 10, marginTop: 10 },
  btnDisabled: { backgroundColor: "#999" },
  btnText: { color: "#fff", textAlign: "center", fontSize: 18, fontWeight: "bold" },
  link: { marginTop: 15, color: "#25D366", textAlign: "center", fontSize: 16 }
});
