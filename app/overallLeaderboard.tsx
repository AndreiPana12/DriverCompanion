import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { db } from '../firebase';
import { collection, query, orderBy, getDocs, DocumentData } from 'firebase/firestore';
import { useRouter } from 'expo-router';

interface UserProfile extends DocumentData {
  id: string;
  username: string;
  averageDrivingScore: number;
  totalTrips: number;
  totalDistance: number;
}

const OverallLeaderboard = () => {
  const router = useRouter();
  const [leaderboardData, setLeaderboardData] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboardData();
  }, []);
  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const q = query(
        collection(db, 'user_driving_profiles'),
        orderBy('averageDrivingScore', 'desc')
      );      
      const querySnapshot = await getDocs(q);
      const users: UserProfile[] = [];      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // validam datele inainte de a le adauga
        // Check if data has the required fields
        if (data && typeof data.username === 'string' && 
            typeof data.averageDrivingScore === 'number' && data.totalDistance > 0) {
          users.push({ 
            id: doc.id, 
            username: data.username,
            averageDrivingScore: data.averageDrivingScore || 0,
            totalTrips: data.totalTrips || 0,
            totalDistance: data.totalDistance || 0
          } as UserProfile);
        }
      });
      setLeaderboardData(users);
    } catch (err) {
      console.error("Error fetching overall leaderboard: ", err);
      setError("Failed to load leaderboard data. Please try again later.");
    } finally {
      setLoading(false);
    }
  };
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading Leaderboard...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchLeaderboardData}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {/*Header*/}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏆 Overall Leaderboard</Text>
        <View style={{ width: 60 }} />
      </View>

      {/*Leaderboard List */}
      {leaderboardData.length === 0 ? (        
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>🏆 No ranking data available yet</Text>
          <Text style={styles.noDataSubtext}>Complete some trips to see the leaderboard!</Text>
        </View>
      ) : (        
      <FlatList
          data={leaderboardData}
          keyExtractor={(item) => item.id}          
          renderItem={({ item, index }) => 
            {
            if (!item || !item.username || typeof item.averageDrivingScore !== 'number') {
              return null;
            }
            
            return (
            <View style={[styles.leaderboardItem, { 
              backgroundColor: index < 3 ? 'rgba(255, 215, 0, 0.1)' : 'transparent'
            }]}>
              <View style={styles.rankContainer}>
                <Text style={styles.rankNumber}>
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.username}>{item.username}</Text>
                <Text style={styles.userStats}>
                  {item.totalTrips || 0} trip{(item.totalTrips || 0) !== 1 ? 's' : ''} • {(item.totalDistance || 0).toFixed(1)}km
                </Text>
              </View>
              <View style={styles.scoreContainer}>
                <Text style={[styles.leaderboardScore, {
                  color: (item.averageDrivingScore || 0) >= 80 ? '#4CAF50' : 
                         (item.averageDrivingScore || 0) >= 60 ? '#FF9800' : '#F44336'
                }]}>
                  {Math.round(item.averageDrivingScore || 0)}
                </Text>
                <Text style={styles.scoreText}>avg</Text>
              </View>
            </View>
            );
          }}style={styles.leaderboardList}
        />
      )}

      <Text style={styles.disclaimer}>
        🎯 Keep driving safely to improve your ranking!
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },  leaderboardList: {
    flex: 1,
    padding: 16,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  rankContainer: {
    width: 50,
    alignItems: 'center',
  },
  rankNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  userStats: {
    fontSize: 14,
    color: '#666',
  },
  scoreContainer: {
    alignItems: 'center',
    minWidth: 60,
  },
  leaderboardScore: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scoreText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  noDataText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },  disclaimer: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});

export default OverallLeaderboard;
