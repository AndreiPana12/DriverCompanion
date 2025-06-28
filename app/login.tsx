import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useState } from 'react';
import { 
  Alert, 
  StyleSheet, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  View,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Dimensions,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../firebase';
import AnimatedButton from '../components/AnimatedButton';

const { width } = Dimensions.get('window');

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (isLoading) return;
    if (!identifier || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      let emailToUse = identifier;

      if (!identifier.includes('@')) {
        const q = query(collection(db, 'users'), where('username', '==', identifier));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          emailToUse = querySnapshot.docs[0].data().email;
        } else {
          Alert.alert('Error', 'Username not found!');
          setIsLoading(false);
          return;
        }
      }

      const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData?.admin === true) {
          router.replace('/admin');
        } else {
          router.replace('/main');
        }
      } else {
        router.replace('/main');
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        Alert.alert('Error', error.message);
      } else {
        Alert.alert('Error', 'An unexpected error occurred');
      }
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <LinearGradient
            colors={['#0A1128', '#001F54']}
            style={StyleSheet.absoluteFillObject}
          />
          
          <View style={styles.glowCircle} />

          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerContainer}>
              <View style={styles.titleContainer}>
                <Text style={styles.welcomeText}>Welcome Back</Text>
                <LinearGradient
                  colors={['#4361EE', '#3A0CA3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.gradientUnderline}
                />
              </View>
              <Text style={styles.subtitle}>Sign in to continue your journey</Text>
            </View>

            <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Text style={styles.labelText}>Username or Email</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                placeholder="Enter your username or email"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={identifier}
                onChangeText={setIdentifier}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.labelText}>Password</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                style={styles.input}
              />
            </View>
          </View>

          <AnimatedButton
            onPress={handleLogin}
            text={isLoading ? 'Signing In...' : 'Sign In'}
            disabled={isLoading}
            style={styles.button}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={styles.linkText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
            </View>
          </ScrollView>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1128',
  },
  glowCircle: {
    position: 'absolute',
    top: -200,
    right: -200,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(67, 97, 238, 0.15)',
    transform: [{ scale: 1.5 }],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  headerContainer: {
    paddingTop: 60,
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  titleContainer: {
    marginBottom: 20,
  },
  gradientUnderline: {
    height: 3,
    width: 40,
    borderRadius: 2,
    marginTop: 10,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 16,
    color: '#4361EE',
    opacity: 0.9,
    letterSpacing: 0.5,
  },
  formContainer: {
    paddingHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  labelText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
    opacity: 0.9,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(67, 97, 238, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    overflow: 'hidden',
  },
  input: {
    padding: 15,
    color: '#fff',
    fontSize: 16,
  },
  button: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    overflow: 'hidden',
    shadowColor: '#4361EE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  footerText: {
    color: '#fff',
    opacity: 0.8,
    marginRight: 5,
  },
  linkText: {
    color: '#4361EE',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Login;
