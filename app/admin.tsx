'use client';
import { db } from '@/firebase';
import * as Location from 'expo-location';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SPEED_LIMITS = [30, 50, 60, 70, 90, 130];

const signImages: Record<number, any> = {
  30: require('@/assets/images/30a.jpg'),
  50: require('@/assets/images/50km h.webp'),
  60: require('@/assets/images/60km h.jpg'),
  70: require('@/assets/images/70 kmph.jpg'),
  90: require('@/assets/images/90 kmph.png'),
  130: require('@/assets/images/130 km h.webp'),
};

export default function AdminPage() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState('Fetching address...');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let subscription: Location.LocationSubscription;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 5,
        },
        async (loc) => {
          setLocation(loc);
          try {
            const [result] = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
            const street = result.street ? result.street.trim() : 'Unknown Street';
            const city = result.city ? result.city.trim() : '';
            setAddress(`${street}${city ? ', ' + city : ''}`);
          } catch (err) {
            console.error('Reverse geocoding error:', err);
            setAddress('Unable to get address');
          }
        }
      );
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  const handleSetSpeedLimit = async (limit: number) => {
    if (!location) return Alert.alert('Error', 'No location data available.');
    try {
      const { latitude, longitude } = location.coords;
      const parts = address.split(',');
      const normalizedStreet = parts[0] ? parts[0].trim().toLowerCase() : 'unknown street';
      const normalizedCity = parts[1] ? parts[1].trim().toLowerCase() : '';

      const locQuery = query(
        collection(db, 'locationspeedlimit'),
        where('street', '==', normalizedStreet),
        where('city', '==', normalizedCity)
      );
      const querySnapshot = await getDocs(locQuery);

      if (!querySnapshot.empty) {
        Alert.alert(
          'Confirm Update',
          `Street (${normalizedStreet}) already has a speed limit. Update it?`,
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes',
              onPress: async () => {
                const docId = querySnapshot.docs[0].id;
                await setDoc(
                  doc(db, 'locationspeedlimit', docId),
                  {
                    street: normalizedStreet,
                    city: normalizedCity,
                    latitude,
                    longitude,
                    speedLimit: limit,
                    timestamp: new Date().toISOString(),
                  },
                  { merge: true }
                );
                Alert.alert('Updated!', `Speed limit set to ${limit} km/h.`);
              },
            },
          ]
        );
      } else {
        const newDocRef = doc(db, 'locationspeedlimit', `${Date.now()}`);
        await setDoc(newDocRef, {
          street: normalizedStreet,
          city: normalizedCity,
          latitude,
          longitude,
          speedLimit: limit,
          timestamp: new Date().toISOString(),
        });
        Alert.alert('Success', `Speed limit of ${limit} km/h set for ${normalizedStreet}.`);
      }
    } catch (error) {
      console.error('Error saving speed limit:', error);
      Alert.alert('Error', 'Could not save speed limit to Firestore.');
    }
  };

  if (errorMsg) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Profile</Text>   
      <Text style={styles.info}>Current Location: {address}</Text>

      {/* Speed limit buttons only (camera logic removed) */}
      <View style={styles.buttonsContainer}>
        {SPEED_LIMITS.map((limit) => (
          <TouchableOpacity
            key={limit}
            style={styles.button}
            onPress={() => handleSetSpeedLimit(limit)}
          >
            <Image source={signImages[limit]} style={styles.signImage} />
            <Text style={styles.limitText}>{limit}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    color: '#E94560',
    marginBottom: 20,
    fontWeight: 'bold',
  },
  info: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  buttonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  button: {
    width: 80,
    height: 80,
    margin: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signImage: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
  },
  limitText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
  },
  error: {
    color: 'red',
    fontSize: 18,
    textAlign: 'center',
  },
});
