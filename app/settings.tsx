import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Modal, FlatList, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

interface CustomMarker {
  id: string;
  coordinate: {
    latitude: number;
    longitude: number;
  };
  type: string;
  emoji: string;
  title: string;
  isPublic: boolean;
  userId?: string;
  timestamp?: string;
}

interface UserProfile {
  username: string;
  email: string;
  totalTrips?: number;
  totalDistance?: number;
  averageDrivingScore?: number;
}

interface DrivingAnalytics {
  averageScore: number;
  bestScore: number;
  worstScore: number;
  totalTrips: number;
  totalDistance: number;
  recentScores: number[];
}

const Settings = () => {
  const router = useRouter();  const [userMarkers, setUserMarkers] = useState<CustomMarker[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showMarkersModal, setShowMarkersModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showChangeNameModal, setShowChangeNameModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [drivingAnalytics, setDrivingAnalytics] = useState<DrivingAnalytics | null>(null);
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: handleLogout }
      ]
    );
  };  // Fetch user's markers from database
  const fetchUserMarkers = async () => {
    if (!auth.currentUser) return;
    
    try {
      // interogare pentru markerele utilizatorului curent
      const markersQuery = query(
        collection(db, 'custommarkers'),
        where('userId', '==', auth.currentUser.uid)
      );
      
      const markersSnapshot = await getDocs(markersQuery);
      const markers: CustomMarker[] = [];
      
      markersSnapshot.forEach((doc) => {
        const data = doc.data();
        markers.push({
          id: doc.id,
          coordinate: {
            latitude: data.latitude,
            longitude: data.longitude,
          },
          type: data.type,
          emoji: data.emoji,
          title: data.title,
          isPublic: data.isPublic ?? true,
          userId: data.userId,
          timestamp: data.timestamp,
        });
      });
      
      setUserMarkers(markers);
      console.log(`Loaded ${markers.length} markers for current user`);
    } catch (error) {
      console.error('Error fetching user markers:', error);
      Alert.alert('Error', 'Could not load your markers');
    }
  };

  // luam profilul utilizatorului curent
  const fetchUserProfile = async () => {
    if (!auth.currentUser) return;
    
    try {
      // luam informatiile de profil ale utilizatorului
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      let profile: UserProfile = {
        username: 'Driver',
        email: auth.currentUser.email || 'No email',
      };
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        profile.username = userData.username || 'Driver';
      }
      
      // luam documentul de profil de conducere al utilizatorului
      const drivingProfileDoc = await getDoc(doc(db, 'user_driving_profiles', auth.currentUser.uid));
      if (drivingProfileDoc.exists()) {
        const drivingData = drivingProfileDoc.data();
        profile.totalTrips = drivingData.totalTrips || 0;
        profile.totalDistance = Math.round((drivingData.totalDistance || 0) * 100) / 100;
        profile.averageDrivingScore = Math.round((drivingData.averageDrivingScore || 0) * 100) / 100;
      }
      
      setUserProfile(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  useEffect(() => {
    fetchUserProfile();
  }, []);

  const handleViewMarkers = () => {
    fetchUserMarkers();
    setShowMarkersModal(true);
  };

  const handleProfileSettings = () => {
    fetchUserProfile();
    setShowProfileModal(true);
  };
  const handleAbout = () => {
    setShowAboutModal(true);
  };
  const handleChangeName = () => {
    setNewUsername(userProfile?.username || '');
    setShowChangeNameModal(true);
  };  
  const handleDrivingAnalytics = async () => {
    if (!auth.currentUser) return;
    
    try {
      console.log('Current user ID:', auth.currentUser.uid);
      
      // luam documentul de profil de conducere al utilizatorului
      const drivingProfileDoc = await getDoc(doc(db, 'user_driving_profiles', auth.currentUser.uid));
      
      if (drivingProfileDoc.exists()) {
        const data = drivingProfileDoc.data();
        console.log('Driving profile data:', data);
        
        // luam datele de sumarizare zilnica pentru utilizator
        const dailyTripsQuery = query(
          collection(db, 'daily_trip_summaries'),
          where('userId', '==', auth.currentUser.uid)
        );
        
        console.log('Querying daily_trip_summaries for userId:', auth.currentUser.uid);
        const dailyTripsSnapshot = await getDocs(dailyTripsQuery);
        console.log('Number of daily trip documents found:', dailyTripsSnapshot.size);
        
        const tripScores: { score: number, date: string }[] = [];        // procesare scoruri din documentele de sumarizare zilnica
        dailyTripsSnapshot.forEach((doc) => {
          const tripData = doc.data();
          console.log('Processing daily trip document:', doc.id, tripData);
            // scorul mediu al zilei respective
          if (tripData.averageScore !== undefined && tripData.averageScore !== null) {
            tripScores.push({
              score: Math.round(tripData.averageScore),
              date: tripData.date || tripData.lastUpdated || new Date().toISOString()
            });
            console.log('Added daily average score:', Math.round(tripData.averageScore), 'for date:', tripData.date);
          }
        });
        
        // Sortare dupa data si preluare ultimelor 7 scoruri
        const sortedTripScores = tripScores
          .sort((a, b) => {
            // convertim datele in timestamp pentru comparare
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateA - dateB;
          })
          .slice(-7)
          .map(trip => trip.score);
        
        console.log('Final sorted recent scores:', sortedTripScores);
        console.log('Total trip records processed:', tripScores.length);
        
        const analytics: DrivingAnalytics = {
          averageScore: Math.round((data.averageDrivingScore || 0) * 100) / 100,
          bestScore: Math.round((data.bestScore || 0) * 100) / 100,
          worstScore: Math.round((data.worstScore || 0) * 100) / 100,
          totalTrips: data.totalTrips || 0,
          totalDistance: Math.round((data.totalDistance || 0) * 100) / 100,
          recentScores: sortedTripScores,
        };
        
        console.log('Final analytics object:', analytics);
        setDrivingAnalytics(analytics);
        setShowAnalyticsModal(true);
        // daca no recent scores, show alert
        if (sortedTripScores.length === 0) {
          Alert.alert(
            'No Recent Scores', 
            'No recent trip scores found in daily_trip_summaries. Check the console logs for debugging information.'
          );
        }
      } else {
        console.log('No driving profile document found for user:', auth.currentUser.uid);
        Alert.alert('No Data', 'No driving data available yet. Take some trips to see your analytics!');
      }    } catch (error) {
      console.error('Error fetching driving analytics:', error);
      Alert.alert('Error', 'Could not load driving analytics: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const updateUsername = async () => {
    if (!auth.currentUser || !newUsername.trim()) {
      Alert.alert('Error', 'Please enter a valid username');
      return;
    }

    try {
      const userId = auth.currentUser.uid;
      
      await setDoc(doc(db, 'users', userId), {
        username: newUsername.trim(),
        email: auth.currentUser.email,
      }, { merge: true });

      const drivingProfileDoc = await getDoc(doc(db, 'user_driving_profiles', userId));
      if (drivingProfileDoc.exists()) {
        await setDoc(doc(db, 'user_driving_profiles', userId), {
          username: newUsername.trim(),
        }, { merge: true });
      }

      
      if (userProfile) {
        setUserProfile({
          ...userProfile,
          username: newUsername.trim(),
        });
      }

      setShowChangeNameModal(false);
      Alert.alert('Success', 'Username updated successfully!');
    } catch (error) {
      console.error('Error updating username:', error);
      Alert.alert('Error', 'Failed to update username. Please try again.');
    }
  };

  const formatDate = (timestamp: string) => {
    if (!timestamp) return 'Unknown date';
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return 'Unknown date';
    }
  };

  // Delete a user's marker
  const deleteMarker = async (markerId: string) => {
    try {
      await deleteDoc(doc(db, 'custommarkers', markerId));
      setUserMarkers(prevMarkers => prevMarkers.filter(marker => marker.id !== markerId));
      Alert.alert('Success', 'Marker deleted successfully!');
    } catch (error) {
      console.error('Error deleting marker:', error);
      Alert.alert('Error', 'Could not delete marker. Please try again.');
    }
  };

  const confirmDeleteMarker = (markerId: string, markerTitle: string) => {
    Alert.alert(
      'Delete Marker',
      `Are you sure you want to delete the "${markerTitle}" marker?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMarker(markerId) }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      {/*SettingsContent*/}
      <ScrollView style={styles.content}>
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Account</Text>          
          <TouchableOpacity style={styles.settingItem} onPress={handleProfileSettings}>
            <Text style={styles.settingText}>Profile Settings</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleDrivingAnalytics}>
            <Text style={styles.settingText}>Driving Analytics</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>App</Text>

          <TouchableOpacity style={styles.settingItem} onPress={handleViewMarkers}>
            <Text style={styles.settingText}>View Markers</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem} onPress={handleAbout}>
            <Text style={styles.settingText}>About</Text>
            <Text style={styles.settingArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <View style={styles.logoutSection}>
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={confirmLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/*Profile Modal*/}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showProfileModal}
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Profile Settings</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowProfileModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
              {userProfile && (
              <View style={styles.profileInfo}>
                <View style={styles.profileRow}>
                  <View style={styles.profileSection}>
                    <Text style={styles.profileLabel}>Username:</Text>
                    <Text style={styles.profileValue}>{userProfile.username}</Text>
                  </View>
                  <TouchableOpacity style={styles.changeButton} onPress={handleChangeName}>
                    <Text style={styles.changeButtonText}>Change</Text>
                  </TouchableOpacity>
                </View>
                
                <Text style={styles.profileLabel}>Email:</Text>
                <Text style={styles.profileValue}>{userProfile.email}</Text>
                
                {userProfile.totalTrips !== undefined && (
                  <>
                    <Text style={styles.profileLabel}>Total Trips:</Text>
                    <Text style={styles.profileValue}>{userProfile.totalTrips}</Text>
                    
                    <Text style={styles.profileLabel}>Total Distance:</Text>
                    <Text style={styles.profileValue}>{`${userProfile.totalDistance} km`}</Text>
                    
                    <Text style={styles.profileLabel}>Average Driving Score:</Text>
                    <Text style={styles.profileValue}>{`${userProfile.averageDrivingScore}/100`}</Text>
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Markers Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showMarkersModal}
        onRequestClose={() => setShowMarkersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Your Markers</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowMarkersModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
              <FlatList
              data={userMarkers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.markerItem}>
                  <Text style={styles.markerEmoji}>{item.emoji || 'PIN'}</Text>
                  <View style={styles.markerInfo}>
                    <Text style={styles.markerTitle}>{item.title || 'Unknown Marker'}</Text>
                    <Text style={styles.markerCoords}>
                      {`${item.coordinate?.latitude?.toFixed(4) || '0.0000'}, ${item.coordinate?.longitude?.toFixed(4) || '0.0000'}`}
                    </Text>
                    <Text style={styles.markerDate}>
                      {formatDate(item.timestamp || '')}
                    </Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.deleteButton}
                    onPress={() => confirmDeleteMarker(item.id, item.title)}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No markers found</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAboutModal}
        onRequestClose={() => setShowAboutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>About</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowAboutModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
              <View style={styles.aboutContent}>              
                <Text style={styles.aboutText}>
                  Safe Drive App
                </Text>
                <Text style={styles.aboutText}>
                  Version 1.0.0
                </Text>
                <Text style={styles.aboutDescription}>
                  Track your driving behavior, view weather conditions, and share markers with other drivers for a safer driving experience.
                </Text>
                <Text style={styles.aboutFeatures}>
                  Features:
                  {`
                    • Real-time driving behavior tracking
                    • Weather monitoring
                    • Custom markers
                    • Trip history
                    • Leaderboards`
                  }
                </Text>
            </View>
            </View>
        </View>
      </Modal>
      
      {/* Driving Analytics Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAnalyticsModal}
        onRequestClose={() => setShowAnalyticsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Driving Analytics</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowAnalyticsModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
              {drivingAnalytics ? (
              <ScrollView style={styles.analyticsContent}>
                {/* Overview Stats */}
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{drivingAnalytics.averageScore}</Text>
                    <Text style={styles.statLabel}>Average Score</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{drivingAnalytics.bestScore}</Text>
                    <Text style={styles.statLabel}>Best Score</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{drivingAnalytics.totalTrips}</Text>
                    <Text style={styles.statLabel}>Total Trips</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{drivingAnalytics.totalDistance}</Text>
                    <Text style={styles.statLabel}>Distance (km)</Text>
                  </View>
                </View>

                {/* Recent Scores Chart */}
                {drivingAnalytics.recentScores && drivingAnalytics.recentScores.length > 0 && (
                  <View style={styles.chartSection}>
                    <Text style={styles.chartTitle}>Recent Trip Scores</Text>
                    <View style={styles.chartContainer}>
                      <View style={styles.chart}>
                        {drivingAnalytics.recentScores.map((score, index) => (
                          <View key={index} style={styles.barContainer}>
                            <View 
                              style={[
                                styles.bar, 
                                { 
                                  height: `${score}%`,
                                  backgroundColor: score >= 80 ? '#4CAF50' : score >= 60 ? '#FF9800' : '#F44336'
                                }
                              ]} 
                            />
                            <Text style={styles.barLabel}>{score}</Text>
                            <Text style={styles.barIndex}>{`T${index + 1}`}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                )}

                {/* Performance Breakdown */}
                <View style={styles.performanceSection}>
                  <Text style={styles.performanceSectionTitle}>Performance Overview</Text>
                  
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceLabel}>Safety Rating:</Text>
                    <Text style={styles.performanceValue}>
                      {`${drivingAnalytics.averageScore}/100`}
                    </Text>
                  </View>                  
                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceLabel}>Best Performance:</Text>
                    <Text style={styles.performanceValue}>
                      {`${drivingAnalytics.bestScore}/100`}
                    </Text>
                  </View>

                  <View style={styles.performanceItem}>
                    <Text style={styles.performanceLabel}>Improvement Potential:</Text>
                    <Text style={styles.performanceValue}>
                      {`${Math.max(0, 100 - (drivingAnalytics.averageScore || 0)).toFixed(3)} points`}
                    </Text>
                  </View>                
                </View>
              </ScrollView>
            ) : (
              <View style={styles.analyticsContent}>
                <Text style={styles.emptyText}>Loading analytics...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Change Name Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showChangeNameModal}
        onRequestClose={() => setShowChangeNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Username</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowChangeNameModal(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.changeNameContent}>
              <Text style={styles.inputLabel}>New Username:</Text>
              <TextInput
                style={styles.textInput}
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="Enter new username"
                autoCapitalize="none"
                maxLength={30}
              />
              
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowChangeNameModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={updateUsername}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 15,
    paddingLeft: 5,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  settingText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  settingArrow: {
    fontSize: 20,
    color: '#c7c7cc',
    fontWeight: 'bold',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  settingsSection: {
    marginBottom: 30,
  },
  logoutSection: {
    marginTop: 20,
    marginBottom: 20,
  },
  logoutButton: {
    backgroundColor: '#FF4757',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#FF4757',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    margin: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666666',
    fontWeight: 'bold',
  },  // Profile modal styles
  profileInfo: {
    paddingVertical: 10,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  profileSection: {
    flex: 1,
  },
  profileLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333333',
    marginTop: 15,
    marginBottom: 5,
  },
  profileValue: {
    fontSize: 16,
    color: '#666666',
    paddingLeft: 10,
  },
  changeButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },
  changeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Markers modal styles
  markerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    padding: 15,
    marginBottom: 10,
    borderRadius: 10,
  },
  markerEmoji: {
    fontSize: 24,
    marginRight: 15,
  },
  markerInfo: {
    flex: 1,
  },
  markerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  markerCoords: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 2,
  },
  markerDate: {
    fontSize: 12,
    color: '#999999',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666666',
    marginTop: 50,
  },
  // About modal styles
  aboutContent: {
    paddingVertical: 10,
  },
  aboutText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 10,
  },
  aboutDescription: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },  aboutFeatures: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 22,
  },
  // Change name modal styles
  changeNameContent: {
    paddingVertical: 10,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 10,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Analytics modal styles
  analyticsContent: {
    paddingVertical: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 15,
    width: '48%',
    marginBottom: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },  chartSection: {
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 20,
  },  chartContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 20,
    height: 290,
  },  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 180,
    paddingBottom: 35,
    paddingTop: 10,
    marginTop: 100,
  },
  barContainer: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },  bar: {
    width: 20,
    borderRadius: 3,
    minHeight: 5,
    maxHeight: 180,
  },
  barLabel: {
    fontSize: 10,
    color: '#333333',
    marginTop: 5,
    fontWeight: 'bold',
  },
  barIndex: {
    fontSize: 8,
    color: '#999999',
    marginTop: 2,
  },  performanceSection: {
    marginTop: 10,
  },
  performanceSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 15,
  },
  performanceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  performanceLabel: {
    fontSize: 14,
    color: '#666666',
  },  performanceValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333333',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 10,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default Settings;
