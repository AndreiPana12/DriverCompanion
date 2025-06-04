import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Dimensions, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

export default function Welcome() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A1128', '#001F54']}
        style={StyleSheet.absoluteFillObject}
      />
      
      <View style={styles.glowCircle} />
      
      <View style={styles.topSection}>
        <View style={styles.logoContainer}>
          <Text style={styles.emoji}>🚗</Text>
          <LinearGradient
            colors={['#4361EE', '#3A0CA3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientUnderline}
          />
        </View>
        <Text style={styles.title}>DriverCompanion</Text>
        <Text style={styles.subtitle}>Elevate Your Journey</Text>
      </View>

      <View style={styles.middleSection}>
        {[
          { emoji: '🎯', text: 'Smart Navigation', subtext: 'Real-time routing' },
          { emoji: '⚡', text: 'Speed Monitor', subtext: 'Safety first' },
          { emoji: '🛡️', text: 'Advanced Safety', subtext: 'Proactive alerts' }
        ].map((feature, index) => (
          <View key={index} style={styles.featureBox}>
            <LinearGradient
              colors={['rgba(67, 97, 238, 0.1)', 'rgba(58, 12, 163, 0.1)']}
              style={StyleSheet.absoluteFillObject}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <Text style={styles.featureEmoji}>{feature.emoji}</Text>
            <Text style={styles.featureText}>{feature.text}</Text>
            <Text style={styles.featureSubtext}>{feature.subtext}</Text>
          </View>
        ))}
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.loginButton} 
          onPress={() => router.push('/login')}
        >
          <LinearGradient
            colors={['#4361EE', '#3A0CA3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Text style={styles.loginText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.signupButton} 
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.signupText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0A1128',
    paddingVertical: 60,
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
  topSection: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 10,
  },
  gradientUnderline: {
    height: 3,
    width: 40,
    borderRadius: 2,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 18,
    color: '#4361EE',
    marginBottom: 20,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  middleSection: {
    flexDirection: 'column',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
    gap: 15,
  },
  featureBox: {
    borderRadius: 15,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(67, 97, 238, 0.3)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  featureEmoji: {
    fontSize: 24,
    marginRight: 15,
  },
  featureText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureSubtext: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    position: 'absolute',
    right: 20,
  },
  buttonContainer: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 15,
  },
  loginButton: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4361EE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  signupButton: {
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4361EE',
  },
  loginText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  signupText: {
    color: '#4361EE',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
