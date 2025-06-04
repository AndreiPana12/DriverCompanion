import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
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
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../firebase';
import AnimatedButton from '../components/AnimatedButton';

const SignUp = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async () => {
    if (isLoading) return;
    if (!email || !password || !confirmPassword || !username) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match!');
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      await setDoc(doc(db, 'users', user.uid), {
        username: username,
        email: email,
        createdAt: new Date().toISOString(),
      });

      Alert.alert(
        'Success', 
        'Account created successfully!',
        [{ text: 'OK', onPress: () => router.replace('/main') }]
      );
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
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <LinearGradient
          colors={['#0A1128', '#001F54']}
          style={StyleSheet.absoluteFillObject}
        />
        
        <View style={styles.glowCircle} />
        
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContainer}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>Create Account</Text>
              <LinearGradient
                colors={['#4361EE', '#3A0CA3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientUnderline}
              />
            </View>
            <Text style={styles.subtitle}>Join DriverCompanion today</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Text style={styles.labelText}>Username</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  placeholder="Choose a username"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={username}
                  onChangeText={setUsername}
                  style={styles.input}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.labelText}>Email</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  placeholder="Enter your email"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={email}
                  onChangeText={setEmail}
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
                  placeholder="Create a password"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.labelText}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  placeholder="Confirm your password"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  style={styles.input}
                />
              </View>
            </View>

          <AnimatedButton
            onPress={handleSignUp}
            text={isLoading ? 'Creating Account...' : 'Create Account'}
            disabled={isLoading}
            style={styles.button}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/login')}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </TouchableWithoutFeedback>
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
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
  },
  gradientUnderline: {
    height: 3,
    width: 40,
    borderRadius: 2,
    marginTop: 10,
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

export default SignUp;
