// screens/Auth.js
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,ImageBackground } from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebaseConfig";

export default function Auth({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Erreur", "Tous les champs sont obligatoires");
      return;
    }

    if (!email.includes("@")) {
      Alert.alert("Erreur", "Email invalide");
      return;
    }

    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      console.log("Erreur login:", err);

      if (err.code === "auth/user-not-found") {
        Alert.alert("Erreur", "Aucun compte trouvé avec cet email");
      } else if (err.code === "auth/wrong-password") {
        Alert.alert("Erreur", "Mot de passe incorrect");
      } else if (err.code === "auth/invalid-email") {
        Alert.alert("Erreur", "Email invalide");
      } else if (err.code === "auth/invalid-credential") {
        Alert.alert("Erreur", "Email ou mot de passe incorrect");
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
        <Text style={styles.title}>Connexion</Text>

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
          placeholder="Mot de passe" 
          style={styles.input} 
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholderTextColor="#ccc"
        />

        <TouchableOpacity 
          style={[styles.btn, loading && styles.btnDisabled]} 
          onPress={login}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Se connecter</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>Créer un compte</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)", 
  },

  container: { 
    flex: 1, 
    justifyContent: "center", 
    padding: 20 
  },

  title: { 
    fontSize: 32, 
    marginBottom: 25, 
    fontWeight: "bold", 
    textAlign: "center",
    color: "#fff"
  },

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

  btn: { 
    backgroundColor: "#25D366", 
    padding: 15, 
    borderRadius: 10, 
    marginTop: 10 
  },

  btnDisabled: { 
    backgroundColor: "#999" 
  },

  btnText: { 
    color: "#fff", 
    textAlign: "center", 
    fontSize: 18, 
    fontWeight: "bold" 
  },

  link: { 
    marginTop: 15, 
    color: "#25D366", 
    textAlign: "center",
    fontSize: 16
  }
});
