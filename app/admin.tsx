'use client';
import { db } from '@/firebase';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, FlatList, Modal } from 'react-native';

const SPEED_LIMITS = [30, 50, 60, 70, 90, 130];

interface PlacePrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface PlaceDetails {
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
}

export default function AdminPage() {  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [address, setAddress] = useState('Fetching address...');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [showPredictions, setShowPredictions] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  // Google Maps API key - you should add this to your environment variables
  const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;

  const searchPlaces = async (query: string) => {
    if (query.length < 3) {
      setPredictions([]);
      setShowPredictions(false);
      return;
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=route&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.predictions) {
        setPredictions(data.predictions);
        setShowPredictions(true);
      }
    } catch (error) {
      console.error('Error fetching places:', error);
    }
  };

  const getPlaceDetails = async (placeId: string) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,geometry&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      
      if (data.result) {
        setSelectedPlace(data.result);
        setSearchQuery(data.result.formatted_address);
        setShowPredictions(false);
      }
    } catch (error) {
      console.error('Error fetching place details:', error);
    }
  };

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
    await setSpeedLimitForLocation(limit, location.coords.latitude, location.coords.longitude, address);
  };

  const handleSetSpeedLimitForSearchedPlace = async (limit: number) => {
    if (!selectedPlace) return Alert.alert('Error', 'No place selected.');
    await setSpeedLimitForLocation(
      limit, 
      selectedPlace.geometry.location.lat, 
      selectedPlace.geometry.location.lng, 
      selectedPlace.formatted_address
    );
  };

  const setSpeedLimitForLocation = async (limit: number, latitude: number, longitude: number, fullAddress: string) => {
    try {
      const parts = fullAddress.split(',');
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
  }  return (
    <>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Admin Profile</Text>
        
        {/* Current Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Location</Text>
          <Text style={styles.info}>{address}</Text>
          <Text style={styles.subtitle}>Set speed limit for current location:</Text>
          
          <View style={styles.speedButtonsContainer}>
            {SPEED_LIMITS.map((limit) => (
              <TouchableOpacity
                key={limit}
                style={styles.speedButton}
                onPress={() => handleSetSpeedLimit(limit)}
              >
                <Text style={styles.speedButtonText}>{limit}</Text>
                <Text style={styles.speedButtonUnit}>km/h</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Search Button */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search & Set Speed Limit</Text>
          <Text style={styles.subtitle}>Search for any street worldwide:</Text>
          
          <TouchableOpacity
            style={styles.searchModalButton}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.searchModalButtonText}>🔍 Search Streets</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Search Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Search Streets</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a street..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  searchPlaces(text);
                }}
              />

              {showPredictions && predictions.length > 0 && (
                <FlatList
                  data={predictions}
                  keyExtractor={(item) => item.place_id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.predictionItem}
                      onPress={() => getPlaceDetails(item.place_id)}
                    >
                      <Text style={styles.predictionMain}>{item.structured_formatting.main_text}</Text>
                      <Text style={styles.predictionSecondary}>{item.structured_formatting.secondary_text}</Text>
                    </TouchableOpacity>
                  )}
                  style={styles.predictionsList}
                  showsVerticalScrollIndicator={false}
                />
              )}

              {selectedPlace && (
                <View style={styles.selectedPlaceContainer}>
                  <Text style={styles.selectedPlaceText}>Selected: {selectedPlace.formatted_address}</Text>
                  <Text style={styles.subtitle}>Set speed limit:</Text>
                  
                  <View style={styles.speedButtonsContainer}>
                    {SPEED_LIMITS.map((limit) => (
                      <TouchableOpacity
                        key={limit}
                        style={styles.speedButton}
                        onPress={() => {
                          handleSetSpeedLimitForSearchedPlace(limit);
                          setModalVisible(false);
                          setSearchQuery('');
                          setSelectedPlace(null);
                          setShowPredictions(false);
                        }}
                      >
                        <Text style={styles.speedButtonText}>{limit}</Text>
                        <Text style={styles.speedButtonUnit}>km/h</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    color: '#E94560',
    marginBottom: 30,
    marginTop: 60,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 15,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    color: '#E94560',
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  info: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  speedButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
  },
  speedButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E94560',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  speedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  speedButtonUnit: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  searchContainer: {
    marginBottom: 15,
  },
  searchInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 15,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
  },
  predictionsContainer: {
    maxHeight: 200,
    marginBottom: 15,
  },
  predictionsList: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    maxHeight: 200,
  },
  predictionItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  predictionMain: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  predictionSecondary: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    marginTop: 2,
  },
  selectedPlaceContainer: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 10,
    padding: 15,
    marginTop: 10,
  },
  selectedPlaceText: {
    color: '#E94560',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },  error: {
    color: 'red',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  searchModalButton: {
    backgroundColor: '#E94560',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    shadowColor: '#E94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  searchModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E94560',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
});
