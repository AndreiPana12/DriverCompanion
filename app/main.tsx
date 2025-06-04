import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  FlatList,
  Keyboard,
  Modal,
  Alert,
  Image,
} from 'react-native';
import MapView, {
  PROVIDER_GOOGLE,
  Region,
  LatLng,
  Marker,
} from 'react-native-maps';
import * as Location from 'expo-location';
import { db } from '@/firebase';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import MapViewDirections from 'react-native-maps-directions';
import polyline from '@mapbox/polyline';

import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY ;
// OpenWeatherMap API - Replace with your actual API key
const WEATHER_API_KEY = Constants.expoConfig?.extra?.weatherApiKey || process.env.WEATHER_API_KEY;

// Weather interfaces
interface WeatherData {
  temperature: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  precipitation?: number;
  forecast?: WeatherForecast[];
}

interface WeatherForecast {
  date: string;
  dayName: string;
  temperature: {
    min: number;
    max: number;
  };
  condition: string;
  precipitation: number;
  description: string;
  icon: string;
}

interface WeatherAlert {
  id: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  icon: string;
  timestamp: number;
}

interface CustomMarker {
  id: string;
  coordinate: LatLng;
  type: string;
  emoji: string;
  title: string;
  isPublic: boolean; // Added property to indicate public visibility
}

const MARKER_TYPES = [
  { type: 'police', emoji: '👮', title: 'Police' },
  { type: 'construction', emoji: '🚧', title: 'Construction Zone' },
  { type: 'blocked', emoji: '🚫', title: 'Blocked Road' },
  { type: 'accident', emoji: '🚨', title: 'Accident' },
  { type: 'hazard', emoji: '⚠️', title: 'Hazard' },
];

const TravelMode = {
  DRIVING: 'DRIVING',
  TRANSIT: 'TRANSIT',
  BICYCLING: 'BICYCLING',
  WALKING: 'WALKING',
};

const STROKE_COLORS = {
  active: {
    outerStroke: '#185ABC',
  },
  inactive: {
    outerStroke: '#80868B',
  },
};

const Main = () => {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [speed, setSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState<string | null>(null);
  const [address, setAddress] = useState('Fetching address...');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [tripStarted, setTripStarted] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const [distance, setDistance] = useState<number | null>(null);  const [followUser, setFollowUser] = useState(true);  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [lastRouteOrigin, setLastRouteOrigin] = useState<LatLng | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  
  // New marker-related states
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>([]);
  const [markerMenuVisible, setMarkerMenuVisible] = useState(false);
  const [selectedMarkerType, setSelectedMarkerType] = useState(MARKER_TYPES[0]);
  const [markerPlacementMode, setMarkerPlacementMode] = useState(false);  const [notifiedMarkers, setNotifiedMarkers] = useState<Set<string>>(new Set());  const [routeNotification, setRouteNotification] = useState<string | null>(null);  const [routeCache, setRouteCache] = useState<Map<string, {distance: number, duration: number, timestamp: number}>>(new Map());
  const routeCalculationTimeoutRef = useRef<number | null>(null);

  // Weather-related state
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState<number>(0);
  const [showWeatherAlert, setShowWeatherAlert] = useState(false);
  const [showWeatherForecast, setShowWeatherForecast] = useState(false);
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast[]>([]);

  const fetchPredictions = async (input: string) => {
    if (!input) return setPredictions([]);
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          input
        )}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await response.json();
      if (json.status === 'OK') {
        setPredictions(json.predictions);
      } else {
        console.warn('Prediction error:', json.status);
        setPredictions([]);
      }
    } catch (err) {
      console.error('Fetch prediction error:', err);
    }
  };
  const handleSelectPlace = async (placeId: string) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?placeid=${placeId}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await response.json();
      const loc = json.result.geometry.location;
      const coords = { latitude: loc.lat, longitude: loc.lng };
      
      // Clear weather data when new destination is selected
      clearWeatherData();
      
      setDestination(coords);
      mapRef.current?.animateToRegion({
        ...coords,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setPredictions([]);
      setSearch('');
      Keyboard.dismiss();
      
      // Fetch weather data for the new destination
      if (coords) {
        updateWeatherData(coords);
      }
    } catch (err) {
      console.error('Place details error:', err);
    }
  };
  const startTrip = () => {
    setTripStarted(true);
    setFollowUser(true);
    
    // Fetch weather data when trip starts
    if (destination) {
      updateWeatherData(destination);
    }
  };const stopTrip = () => {
    setTripStarted(false);
    setDestination(null);
    setEta(null);
    setDistance(null);
    setFollowUser(true);
    setLastRouteOrigin(null);
    setIsCalculatingRoute(false);
    setRouteCache(new Map()); // Clear route cache
    resetRouteNotifications();
    
    // Clear weather data when trip stops
    clearWeatherData();
    
    // Clear any pending route calculations
    if (routeCalculationTimeoutRef.current) {
      clearTimeout(routeCalculationTimeoutRef.current);
      routeCalculationTimeoutRef.current = null;
    }
    
    if (region) mapRef.current?.animateToRegion(region);
  };

  const hasArrived = (user: LatLng, dest: LatLng) => {
    const dist = Math.sqrt(
      Math.pow(user.latitude - dest.latitude, 2) +
      Math.pow(user.longitude - dest.longitude, 2)
    );
    return dist < 0.0005;
  };
  const recenterMap = () => {
    if (userLocation) {
      mapRef.current?.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.003,
        longitudeDelta: 0.003,
      });
      setFollowUser(true);
    }
  };  // Weather functions
  const fetchWeatherData = async (location: LatLng): Promise<WeatherData | null> => {
    try {
      console.log('Fetching real weather data from OpenWeatherMap...');
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${location.latitude}&lon=${location.longitude}&appid=${WEATHER_API_KEY}&units=metric`
      );

      if (!response.ok) {
        throw new Error(`Weather API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('OpenWeatherMap weather response:', data);      return {
        temperature: Math.round(data.main.temp),
        condition: data.weather[0].main,
        description: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
        visibility: data.visibility ? Math.round(data.visibility / 1000) : 10, // Convert m to km
        precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      };
    } catch (error) {
      console.error('Error fetching weather data:', error);
      // Return mock data as fallback
      return {
        temperature: Math.round(Math.random() * 25 + 10),
        condition: 'Clear',
        description: 'Weather data unavailable',
        humidity: 50,
        windSpeed: 10,
        visibility: 10,
        precipitation: 0,
      };
    }
  };const fetchWeatherForecast = async (location: LatLng): Promise<WeatherForecast[]> => {
    try {
      console.log('Fetching real weather forecast from OpenWeatherMap...');
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${location.latitude}&lon=${location.longitude}&appid=${WEATHER_API_KEY}&units=metric`
      );

      if (!response.ok) {
        throw new Error(`Weather forecast API request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('OpenWeatherMap forecast response:', data);

      // Process 5-day forecast (OpenWeatherMap returns 40 entries, 8 per day at 3-hour intervals)
      const forecast: WeatherForecast[] = [];
      const dailyData: { [key: string]: any[] } = {};

      // Group forecast data by day
      data.list.forEach((item: any) => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toDateString(); // Use consistent date key
        
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = [];
        }
        dailyData[dateKey].push(item);
      });

      // Process each day to get daily summary
      const sortedDays = Object.keys(dailyData).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      
      for (let i = 0; i < Math.min(5, sortedDays.length); i++) {
        const dateKey = sortedDays[i];
        const dayEntries = dailyData[dateKey];
        const date = new Date(dateKey);
        
        if (dayEntries.length === 0) continue;
        
        // Calculate daily statistics
        const temps = dayEntries.map((entry: any) => entry.main.temp);
        const minTemp = Math.round(Math.min(...temps));
        const maxTemp = Math.round(Math.max(...temps));
        
        // Find the most common weather condition for the day
        const conditionCounts: { [key: string]: number } = {};
        const precipitationAmounts: number[] = [];
        
        dayEntries.forEach((entry: any) => {
          const condition = entry.weather[0].main;
          conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
          
          // Sum precipitation from rain and snow
          const rainAmount = entry.rain?.['3h'] || 0;
          const snowAmount = entry.snow?.['3h'] || 0;
          precipitationAmounts.push(rainAmount + snowAmount);
        });
        
        // Get the most frequent weather condition
        const dominantCondition = Object.keys(conditionCounts).reduce((a, b) => 
          conditionCounts[a] > conditionCounts[b] ? a : b
        );
        
        // Get representative weather entry (midday if available, otherwise first entry)
        const middayEntry = dayEntries.find((entry: any) => {
          const entryHour = new Date(entry.dt * 1000).getHours();
          return entryHour >= 12 && entryHour <= 15;
        }) || dayEntries[0];
        
        const totalPrecipitation = precipitationAmounts.reduce((sum, amount) => sum + amount, 0);
        const weatherIcon = getWeatherIcon(dominantCondition);
        
        forecast.push({
          date: date.toLocaleDateString(),
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          temperature: {
            min: minTemp,
            max: maxTemp,
          },
          condition: dominantCondition,
          precipitation: Math.round(totalPrecipitation * 10) / 10, // Round to 1 decimal place
          description: middayEntry.weather[0].description,
          icon: weatherIcon,
        });
      }      console.log('Processed forecast data:', forecast);
      return forecast;
    } catch (error) {
      console.error('Error fetching weather forecast:', error);
      // Return mock forecast data as fallback
      const mockForecast: WeatherForecast[] = [];
      for (let i = 0; i < 5; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        mockForecast.push({
          date: date.toLocaleDateString(),
          dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
          temperature: {
            min: Math.round(Math.random() * 15 + 5),
            max: Math.round(Math.random() * 15 + 20),
          },
          condition: ['Clear', 'Clouds', 'Rain'][Math.floor(Math.random() * 3)],
          precipitation: Math.random() > 0.7 ? Math.round(Math.random() * 5) : 0,
          description: 'Forecast unavailable',
          icon: ['☀️', '☁️', '🌧️'][Math.floor(Math.random() * 3)],
        });
      }
      return mockForecast;
    }
  };

  const getWeatherIcon = (condition: string): string => {
    const iconMap: { [key: string]: string } = {
      'Clear': '☀️',
      'Clouds': '☁️',
      'Rain': '🌧️',
      'Drizzle': '🌦️',
      'Thunderstorm': '⛈️',
      'Snow': '❄️',
      'Mist': '🌫️',
      'Fog': '🌫️',
      'Haze': '🌫️',
    };
    return iconMap[condition] || '🌤️';
  };

  const generateWeatherAlerts = (weather: WeatherData, forecast?: WeatherForecast[]): WeatherAlert[] => {
    const alerts: WeatherAlert[] = [];
    const timestamp = Date.now();

    // Temperature alerts
    if (weather.temperature <= 0) {
      alerts.push({
        id: `freeze_${timestamp}`,
        message: `Freezing conditions detected (${weather.temperature}°C). Roads may be icy. Drive with extreme caution and reduce speed.`,
        severity: 'high',
        icon: '🧊',
        timestamp,
      });
    } else if (weather.temperature >= 35) {
      alerts.push({
        id: `heat_${timestamp}`,
        message: `Extreme heat detected (${weather.temperature}°C). Stay hydrated and ensure your vehicle's cooling system is working properly.`,
        severity: 'medium',
        icon: '🌡️',
        timestamp,
      });
    }

    // Precipitation alerts
    if (weather.precipitation && weather.precipitation > 0) {
      const severity = weather.precipitation > 5 ? 'high' : 'medium';
      const conditionText = weather.condition.toLowerCase().includes('snow') ? 'snow' : 'rain';
      alerts.push({
        id: `precip_${timestamp}`,
        message: `Active ${conditionText} detected (${weather.precipitation}mm/h). Reduce speed, increase following distance, and turn on headlights.`,
        severity,
        icon: conditionText === 'snow' ? '❄️' : '🌧️',
        timestamp,
      });
    }

    // Visibility alerts
    if (weather.visibility < 5) {
      alerts.push({
        id: `visibility_${timestamp}`,
        message: `Poor visibility conditions (${weather.visibility}km). Use fog lights if available and maintain reduced speed.`,
        severity: 'high',
        icon: '🌫️',
        timestamp,
      });
    }

    // Wind alerts
    if (weather.windSpeed > 40) {
      alerts.push({
        id: `wind_${timestamp}`,
        message: `Strong winds detected (${weather.windSpeed} km/h). Be cautious of crosswinds, especially when passing large vehicles.`,
        severity: 'medium',
        icon: '💨',
        timestamp,
      });
    }

    // Forecast-based alerts for trip planning
    if (forecast && forecast.length > 0) {
      const todayConditions = forecast[0];
      if (todayConditions.precipitation > 2) {
        alerts.push({
          id: `forecast_rain_${timestamp}`,
          message: `Rain expected today (${todayConditions.precipitation}mm). Consider delaying non-essential trips or plan for longer travel times.`,
          severity: 'low',
          icon: '🌦️',
          timestamp,
        });
      }

      // Check for severe weather in upcoming days
      const severeWeatherDays = forecast.filter(day => 
        day.condition.includes('Thunderstorm') || 
        day.condition.includes('Snow') || 
        day.precipitation > 5
      );

      if (severeWeatherDays.length > 0) {
        const day = severeWeatherDays[0];
        alerts.push({
          id: `forecast_severe_${timestamp}`,
          message: `Severe weather expected on ${day.dayName}: ${day.condition}. Plan alternative routes or reschedule travel if possible.`,
          severity: 'medium',
          icon: '⚠️',
          timestamp,
        });
      }
    }

    return alerts;
  };

  const updateWeatherData = async (location: LatLng) => {
    const now = Date.now();
    
    // Only update weather every 15 minutes to avoid excessive API calls
    if (now - lastWeatherUpdate < 15 * 60 * 1000) {
      return;
    }

    try {
      console.log('Updating weather data...');
      const weatherData = await fetchWeatherData(location);
      const forecastData = await fetchWeatherForecast(location);

      if (weatherData) {
        setCurrentWeather(weatherData);
        setWeatherForecast(forecastData);
        
        // Generate alerts
        const alerts = generateWeatherAlerts(weatherData, forecastData);
        setWeatherAlerts(alerts);
        
        // Auto-show high severity alerts
        const highSeverityAlert = alerts.find(alert => alert.severity === 'high');
        if (highSeverityAlert) {
          setShowWeatherAlert(true);
          
          // Auto-hide alert after 10 seconds for high severity
          setTimeout(() => {
            setShowWeatherAlert(false);
          }, 10000);
        }
        
        setLastWeatherUpdate(now);
        console.log('Weather data updated successfully');
      }    } catch (error) {
      console.error('Failed to update weather data:', error);
    }
  };

  // Clear all weather data when trip stops or new destination is selected
  const clearWeatherData = () => {
    console.log('Clearing weather data...');
    setCurrentWeather(null);
    setWeatherAlerts([]);
    setWeatherForecast([]);
    setShowWeatherAlert(false);
    setShowWeatherForecast(false);
    setLastWeatherUpdate(0);
  };

  // Auto-dismiss weather alert
  const dismissWeatherAlert = () => {
    setShowWeatherAlert(false);
  };

  // New marker functions with Firebase integration
  const handleMapPress = async (event: any) => {
    if (!markerPlacementMode) return; // Only allow marker placement when mode is active

    const coordinate = event.nativeEvent.coordinate;
    const markerId = `marker_${Date.now()}`;
    const newMarker: CustomMarker = {
      id: markerId,
      coordinate,
      type: selectedMarkerType.type,
      emoji: selectedMarkerType.emoji,
      title: selectedMarkerType.title,
      isPublic: true, // Ensure all markers are public
    };
    
    try {
      // Save to Firebase
      await setDoc(doc(db, 'custommarkers', markerId), {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        type: selectedMarkerType.type,
        emoji: selectedMarkerType.emoji,
        title: selectedMarkerType.title,
        isPublic: true, // Ensure all markers are public
        timestamp: new Date().toISOString(),
      });
      
      Alert.alert('Success', `${selectedMarkerType.title} marker placed successfully!`);
      setMarkerPlacementMode(false);
    } catch (error) {
      console.error('Error saving marker:', error);
      Alert.alert('Error', 'Could not save marker. Please try again.');
    }
  };

  const checkProximityToMarkers = () => {
    if (!userLocation) return;

    customMarkers.forEach((marker) => {
      const distance = Math.sqrt(
        Math.pow(userLocation.latitude - marker.coordinate.latitude, 2) +
        Math.pow(userLocation.longitude - marker.coordinate.longitude, 2)
      );

      if (distance < 0.0005) { // Adjust proximity threshold as needed
        Alert.alert(
          'Marker Confirmation',
          `Is the ${marker.title} marker still there?`,
          [
            { text: 'Yes', onPress: () => console.log('Marker confirmed') },
            { text: 'No', onPress: async () => {
                try {
                  await deleteDoc(doc(db, 'custommarkers', marker.id));
                  setCustomMarkers((prevMarkers) => prevMarkers.filter((m) => m.id !== marker.id));
                  Alert.alert('Success', 'Marker removed successfully!');
                } catch (error) {
                  console.error('Error removing marker:', error);
                  Alert.alert('Error', 'Could not remove marker. Please try again.');
                }
              }
            },
          ]
        );
      }
    });
  };

  const removeMarker = async (markerId: string) => {
    try {
      await deleteDoc(doc(db, 'custommarkers', markerId));
      Alert.alert('Success', 'Marker removed successfully!');
    } catch (error) {
      console.error('Error removing marker:', error);
      Alert.alert('Error', 'Could not remove marker. Please try again.');
    }
  };

  const toggleMarkerPlacementMode = () => {
    setMarkerPlacementMode(!markerPlacementMode);
    if (!markerPlacementMode) {
      setMarkerMenuVisible(false);
    }
  };
  const selectMarkerType = (markerType: typeof MARKER_TYPES[0]) => {
    setSelectedMarkerType(markerType);
    setMarkerMenuVisible(false);
  };

  const checkMarkersAlongRoute = () => {
    if (!userLocation || !tripStarted || waypoints.length === 0) return;

    customMarkers.forEach((marker) => {
      // Skip if already notified about this marker
      if (notifiedMarkers.has(marker.id)) return;

      // Check if marker is close to the route
      let isOnRoute = false;
      for (const waypoint of waypoints) {
        const distanceToRoute = Math.sqrt(
          Math.pow(marker.coordinate.latitude - waypoint.latitude, 2) +
          Math.pow(marker.coordinate.longitude - waypoint.longitude, 2)
        );
        
        if (distanceToRoute < 0.002) { // Marker is within ~200m of route
          isOnRoute = true;
          break;
        }
      }

      if (isOnRoute) {
        // Check distance from user to marker
        const distanceToUser = Math.sqrt(
          Math.pow(userLocation.latitude - marker.coordinate.latitude, 2) +
          Math.pow(userLocation.longitude - marker.coordinate.longitude, 2)
        );

        // Notify when within 1km of the marker
        if (distanceToUser < 0.01) {
          setRouteNotification(`⚠️ ${marker.title} ahead on your route`);
          setNotifiedMarkers(prev => new Set([...prev, marker.id]));
          
          // Auto-dismiss notification after 4 seconds
          setTimeout(() => {
            setRouteNotification(null);
          }, 4000);
        }
      }
    });
  };

  const resetRouteNotifications = () => {
    setNotifiedMarkers(new Set());
    setRouteNotification(null);
  };

  const decodePolyline = (encoded: string): LatLng[] => {
    try {
      return polyline.decode(encoded).map(([latitude, longitude]: [number, number]) => ({ latitude, longitude }));
    } catch (error) {
      console.error('Error decoding polyline:', error);
      return [];
    }
  };

  const validateDestinationInput = (destination: LatLng | null): boolean => {
    if (!destination || !destination.latitude || !destination.longitude) {
      console.error('Invalid destination input:', destination);
      return false;
    }
    return true;
  };

  // Check if user has moved significantly enough to recalculate route
  const hasMovedSignificantly = (newLocation: LatLng, lastLocation: LatLng | null): boolean => {
    if (!lastLocation) return true;
    
    const distance = Math.sqrt(
      Math.pow(newLocation.latitude - lastLocation.latitude, 2) +
      Math.pow(newLocation.longitude - lastLocation.longitude, 2)
    );
    
    // Only recalculate if moved more than ~100 meters (0.001 degrees ≈ 111 meters)
    return distance > 0.001;
  };

  // Debounced route calculation to prevent excessive API calls
  const debouncedRouteCalculation = (userLoc: LatLng, dest: LatLng) => {
    if (routeCalculationTimeoutRef.current) {
      clearTimeout(routeCalculationTimeoutRef.current);
    }

    routeCalculationTimeoutRef.current = setTimeout(async () => {
      if (!hasMovedSignificantly(userLoc, lastRouteOrigin) && lastRouteOrigin) {
        console.log('Skipping route recalculation - user hasn\'t moved significantly');
        return;
      }

      if (isCalculatingRoute) {
        console.log('Route calculation already in progress');
        return;
      }

      // Check cache first to avoid unnecessary API calls
      const cacheKey = `${userLoc.latitude.toFixed(4)},${userLoc.longitude.toFixed(4)}-${dest.latitude.toFixed(4)},${dest.longitude.toFixed(4)}`;
      const cachedRoute = routeCache.get(cacheKey);
      
      if (cachedRoute && (Date.now() - cachedRoute.timestamp < 10 * 60 * 1000)) { // Use cache if less than 10 minutes old
        console.log('Using cached route data');
        setDistance(cachedRoute.distance);
        setEta(cachedRoute.duration);
        setLastRouteOrigin(userLoc);
        return;
      }

      console.log('Calculating new route...');
      setIsCalculatingRoute(true);
      try {
        const result = await fetchIntermediateWaypoints(userLoc, dest);
        
        setDistance(result.totalDistance);
        setEta(result.totalDuration);
        setWaypoints(result.waypoints);
        setLastRouteOrigin(userLoc);
        
        // Cache the result for future use (with timestamp for cleanup)
        const cacheKey = `${userLoc.latitude.toFixed(4)},${userLoc.longitude.toFixed(4)}-${dest.latitude.toFixed(4)},${dest.longitude.toFixed(4)}`;
        const cacheEntry = {
          distance: result.totalDistance,
          duration: result.totalDuration,
          timestamp: Date.now()
        };
        setRouteCache(prev => {
          const newCache = new Map(prev);
          newCache.set(cacheKey, cacheEntry);
          
          // Clean up cache entries older than 10 minutes
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          for (const [key, value] of newCache.entries()) {
            if (value.timestamp < tenMinutesAgo) {
              newCache.delete(key);
            }
          }
          
          return newCache;
        });
        
        console.log(`Route calculated: ${result.totalDistance.toFixed(2)}km, ${result.totalDuration.toFixed(1)}min`);
      } catch (error) {
        console.error('Error calculating route:', error);
      } finally {
        setIsCalculatingRoute(false);
      }
    }, 2000); // Wait 2 seconds before recalculating
  };

  const fetchIntermediateWaypoints = async (origin: LatLng, destination: LatLng): Promise<{waypoints: LatLng[], totalDistance: number, totalDuration: number}> => {
    if (!validateDestinationInput(destination)) return {waypoints: [], totalDistance: 0, totalDuration: 0};

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&alternatives=false&mode=driving&overview=full&units=metric&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await response.json();

      if (json.status === 'OK' && json.routes && json.routes.length > 0) {
        const route = json.routes[0];
        
        // Get all step coordinates for more detailed route
        let allCoordinates: LatLng[] = [];
        
        route.legs.forEach((leg: any) => {
          leg.steps.forEach((step: any) => {
            // Decode each step's polyline for more detailed coordinates
            const stepCoords = decodePolyline(step.polyline.points);
            allCoordinates = allCoordinates.concat(stepCoords);
          });
        });
        
        // Remove duplicate consecutive coordinates
        const filteredCoordinates = allCoordinates.filter((coord, index) => {
          if (index === 0) return true;
          const prev = allCoordinates[index - 1];
          const distance = Math.sqrt(
            Math.pow(coord.latitude - prev.latitude, 2) +
            Math.pow(coord.longitude - prev.longitude, 2)
          );
          return distance > 0.00001; // Filter out coordinates too close to each other
        });
        
        // Get accurate distance and duration from the route
        const totalDistance = route.legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0) / 1000; // Convert to km
        const totalDuration = route.legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0) / 60; // Convert to minutes
        
        console.log(`Route fetched: ${filteredCoordinates.length} coordinates, ${totalDistance.toFixed(2)}km, ${totalDuration.toFixed(1)}min`);
        
        return {waypoints: filteredCoordinates, totalDistance, totalDuration};
      } else {
        console.warn('Route fetch error:', json.status, json.error_message);
        return {waypoints: [], totalDistance: 0, totalDuration: 0};
      }
    } catch (err) {
      console.error('Fetch waypoints error:', err);
      return {waypoints: [], totalDistance: 0, totalDuration: 0};
    }
  };

  const renderSingleRoute = () => {
    if (!tripStarted || !destination || !userLocation) return null;
    
    // Use a single MapViewDirections component with NO intermediate waypoints
    // This prevents multiple API calls and billing issues
    return (
      <MapViewDirections
        key="single-route"
        origin={userLocation}
        destination={destination}
        waypoints={[]} // No intermediate waypoints to avoid API limits and billing
        apikey={GOOGLE_MAPS_API_KEY}
        strokeWidth={6}
        strokeColor={STROKE_COLORS.active.outerStroke}
        mode={TravelMode.DRIVING as 'DRIVING'}
        optimizeWaypoints={false}
        resetOnChange={false}
        precision="high"
        onError={(err) => {
          console.warn('Route rendering error:', err);
        }}        onReady={(result) => {
          // Reset values before setting new ones to prevent doubling
          setDistance(result.distance);
          setEta(result.duration);
          console.log('Route rendered successfully:', result.distance, 'km,', result.duration, 'min');
        }}
      />
    );
  };

  useEffect(() => {
    // Real-time listener for markers from Firebase
    const unsubscribeMarkers = onSnapshot(
      collection(db, 'custommarkers'),
      (snapshot) => {
        const loadedMarkers: CustomMarker[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedMarkers.push({
            id: doc.id,
            coordinate: {
              latitude: data.latitude,
              longitude: data.longitude,
            },
            type: data.type,
            emoji: data.emoji,
            title: data.title,
            isPublic: data.isPublic ?? true,
          });
        });
        setCustomMarkers(loadedMarkers);
      },
      (error) => {
        console.error('Error fetching markers:', error);
      }
    );

    return () => {
      unsubscribeMarkers();
    };
  }, []);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access location was denied');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      const initialRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      setRegion(initialRegion);
      setUserLocation({ latitude, longitude });
      mapRef.current?.animateToRegion(initialRegion);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        async (loc) => {
          const { latitude, longitude, speed: rawSpeed } = loc.coords;          let currentSpeed = rawSpeed ? rawSpeed * 3.6 : 0;
          if (currentSpeed < 3) currentSpeed = 0;
          setSpeed(currentSpeed);
          const userPos = { latitude, longitude };
          setUserLocation(userPos);

          if (tripStarted && followUser) {
            mapRef.current?.animateToRegion({
              ...userPos,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            });
          }          if (tripStarted && destination && hasArrived(userPos, destination)) {
            stopTrip();
            alert('You have arrived at your destination!');
          }          // Check for markers along route and proximity to markers
          if (tripStarted) {
            checkMarkersAlongRoute();
            checkProximityToMarkers();
            
            // Update weather data when trip is started
            updateWeatherData(userPos);
          }

          try {
            const [result] = await Location.reverseGeocodeAsync(userPos);
            const street = result.street?.trim() || 'unknown street';
            const city = result.city?.trim() || '';
            setAddress(`${street}${city ? ', ' + city : ''}`);

            const normalizedStreet = street.toLowerCase();
            const normalizedCity = city.toLowerCase();

            const locQuery = query(
              collection(db, 'locationspeedlimit'),
              where('street', '==', normalizedStreet),
              where('city', '==', normalizedCity)
            );

            const querySnapshot = await getDocs(locQuery);
            if (!querySnapshot.empty) {
              const record = querySnapshot.docs[0].data();
              setSpeedLimit(`${record.speedLimit}`);
            } else {
              setSpeedLimit(normalizedCity ? '50' : '90');
            }
          } catch (err) {
            console.error('Location error:', err);
            setAddress('Unable to get address');
          }
        }
      );
    })();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [tripStarted, followUser]);  useEffect(() => {
    // Only calculate route if we have both user location and destination, and trip is started
    if (userLocation && destination && tripStarted) {
      debouncedRouteCalculation(userLocation, destination);
    }

    // Cleanup timeout on unmount
    return () => {
      if (routeCalculationTimeoutRef.current) {
        clearTimeout(routeCalculationTimeoutRef.current);
      }
    };
  }, [userLocation, destination, tripStarted]); // Added tripStarted to dependencies

  return (
    <View style={{ flex: 1 }}>
      {region && (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={region}
          showsUserLocation={false}
          provider={PROVIDER_GOOGLE}
          onPress={handleMapPress}
          onPanDrag={() => {
            if (tripStarted && followUser) setFollowUser(false);
          }}
        >
          {userLocation && <Marker coordinate={userLocation}>
                      <View style={styles.carMarkerWrapper}>
                       <Image
                         source={require('@/assets/images/car.png')}
                           style={styles.carImage}
                             resizeMode="contain"
                           />
                       </View>
                    </Marker>}  
          {destination && <Marker coordinate={destination}><Text>📍</Text></Marker>}
          
          {/* Custom Markers from Firebase */}
          {customMarkers
  .filter(marker => 
    marker.coordinate && 
    marker.coordinate.latitude !== null && 
    marker.coordinate.latitude !== undefined && 
    marker.coordinate.longitude !== null && 
    marker.coordinate.longitude !== undefined &&
    typeof marker.coordinate.latitude === 'number' &&
    typeof marker.coordinate.longitude === 'number'
  )
  .map((marker) => (    <Marker
      key={marker.id}
      coordinate={marker.coordinate}
      title={marker.title}
      description={marker.emoji}
    >
      <Text style={{ fontSize: 24 }}>{marker.emoji}</Text>
    </Marker>
  ))}
          
          {tripStarted && destination && userLocation && (
            renderSingleRoute()
          )}
        </MapView>
      )}

      <TextInput
        style={styles.searchBox}
        placeholder="Where to?"
        placeholderTextColor="#666"
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          fetchPredictions(text);
        }}
      />

      {predictions.length > 0 && (
        <FlatList
          style={styles.predictions}
          data={predictions}
          keyExtractor={(item) => item.place_id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.predictionItem}
              onPress={() => handleSelectPlace(item.place_id)}
            >
              <Text style={{ color: '#333', fontSize: 16 }}>{item.description}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Marker Controls */}
      <View style={styles.markerControls}>
        <TouchableOpacity 
          style={[styles.markerButton, { backgroundColor: markerPlacementMode ? '#FF4757' : '#2E3B55' }]}
          onPress={toggleMarkerPlacementMode}
        >
          <Text style={styles.markerButtonText}>
            {markerPlacementMode ? '❌' : '📍'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.markerTypeButton}
          onPress={() => setMarkerMenuVisible(true)}
        >
          <Text style={styles.markerTypeText}>{selectedMarkerType.emoji}</Text>
        </TouchableOpacity>
      </View>

      {markerPlacementMode && (
        <View style={styles.placementInstructions}>
          <Text style={styles.instructionText}>
            Tap on the map to place a {selectedMarkerType.title} marker
          </Text>
        </View>
      )}

      {/* Marker Type Selection Modal */}
      <Modal
        visible={markerMenuVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMarkerMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Marker Type</Text>
            <FlatList
              data={MARKER_TYPES}
              numColumns={3}
              keyExtractor={(item) => item.type}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.markerTypeOption,
                    selectedMarkerType.type === item.type && styles.selectedMarkerType
                  ]}
                  onPress={() => selectMarkerType(item)}
                >
                  <Text style={styles.markerTypeEmoji}>{item.emoji}</Text>
                  <Text style={styles.markerTypeTitle}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setMarkerMenuVisible(false)}
            >
              <Text style={styles.closeModalText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Route Notification */}
      {routeNotification && (
        <View style={styles.routeNotification}>
          <Text style={styles.routeNotificationText}>{routeNotification}</Text>
        </View>
      )}

      {/* Weather Alert Modal */}
      {showWeatherAlert && weatherAlerts.length > 0 && (
        <View style={styles.weatherAlert}>
          <TouchableOpacity 
            style={styles.weatherAlertHeader}
            onPress={() => setShowWeatherAlert(false)}
          >
            <Text style={styles.weatherAlertTitle}>
              {weatherAlerts[0].icon} Weather Alert
            </Text>
            <Text style={styles.closeAlertText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.weatherAlertMessage}>
            {weatherAlerts[0].message}
          </Text>
          {currentWeather && (
            <Text style={styles.weatherDetails}>
              🌡️ {currentWeather.temperature}°C • 💨 {currentWeather.windSpeed} km/h • 👁️ {currentWeather.visibility} km
            </Text>
          )}
        </View>
      )}

      {/* Weather Info Button */}
      {tripStarted && currentWeather && (
        <TouchableOpacity 
          style={styles.weatherButton}
          onPress={() => setShowWeatherAlert(!showWeatherAlert)}
        >
          <Text style={styles.weatherButtonText}>
            🌤️ {currentWeather.temperature}°C
          </Text>
        </TouchableOpacity>
      )}

      {/* Weather Forecast Button */}
      {currentWeather && (
        <TouchableOpacity 
          style={styles.forecastButton}
          onPress={() => setShowWeatherForecast(true)}
        >
          <Text style={styles.forecastButtonText}>
            📅 5-Day Forecast
          </Text>
        </TouchableOpacity>
      )}

      {/* Weather Forecast Modal */}
      <Modal
        visible={showWeatherForecast}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowWeatherForecast(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.forecastModalContent}>
            <View style={styles.forecastHeader}>
              <Text style={styles.forecastTitle}>5-Day Weather Forecast</Text>
              <TouchableOpacity
                style={styles.closeForecastButton}
                onPress={() => setShowWeatherForecast(false)}
              >
                <Text style={styles.closeForecastText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={weatherForecast}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <View style={styles.forecastItem}>
                  <View style={styles.forecastDay}>
                    <Text style={styles.forecastDayName}>{item.dayName}</Text>
                    <Text style={styles.forecastDate}>{item.date}</Text>
                  </View>
                  
                  <View style={styles.forecastWeather}>
                    <Text style={styles.forecastIcon}>{item.icon}</Text>
                    <Text style={styles.forecastCondition}>{item.condition}</Text>
                  </View>
                  
                  <View style={styles.forecastTemperature}>
                    <Text style={styles.forecastTempMax}>{item.temperature.max}°</Text>
                    <Text style={styles.forecastTempMin}>{item.temperature.min}°</Text>
                  </View>
                  
                  {item.precipitation > 0 && (
                    <View style={styles.forecastPrecipitation}>
                      <Text style={styles.forecastPrecipText}>
                        🌧️ {item.precipitation.toFixed(1)}mm
                      </Text>
                    </View>
                  )}
                </View>
              )}
              style={styles.forecastList}
            />
            
            <Text style={styles.forecastDisclaimer}>
              💡 Plan your trips accordingly based on weather conditions
            </Text>
          </View>
        </View>
      </Modal>

      {destination && !tripStarted && (
        <TouchableOpacity style={styles.tripButton} onPress={startTrip}>
          <Text style={styles.tripButtonText}>Start Navigation</Text>
        </TouchableOpacity>
      )}
      {tripStarted && (
        <>
          <TouchableOpacity style={styles.stopButton} onPress={stopTrip}>
            <Text style={styles.stopButtonText}>⛔</Text>
          </TouchableOpacity>

          <View style={styles.speedLimitBadge}>
            <Text style={[styles.speedLimitText, { 
              color: speed > Number(speedLimit) ? '#FF4757' : '#2E3B55'
            }]}>
              {speedLimit ?? '--'}
            </Text>
          </View>
        </>
      )}

      {tripStarted && !followUser && (
        <TouchableOpacity style={styles.recenterButton} onPress={recenterMap}>
          <Text style={styles.recenterText}>🎯</Text>
        </TouchableOpacity>
      )}

      {tripStarted && (
        <View style={styles.bottomInfo}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[styles.bottomText, { fontSize: 24, fontWeight: 'bold' }]}>
              {speed.toFixed(1)} 
            </Text>
            <Text style={[styles.bottomText, { fontSize: 16, marginLeft: 4 }]}>km/h</Text>
          </View>
          <Text style={[styles.bottomText, { opacity: 0.9 }]}>
            {eta ? Math.round(eta) + ' min' : '--'} • {distance ? distance.toFixed(1) + ' km' : '--'}
          </Text>
          <Text style={[styles.bottomText, { opacity: 0.8 }]}>📍 {address}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
  },
  searchBox: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 15,
    paddingLeft: 20,
    zIndex: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    fontSize: 16,
  },
  predictions: {
    position: 'absolute',
    top: 105,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    maxHeight: 200,
    zIndex: 9,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  predictionItem: {
    padding: 15,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
    borderBottomWidth: 1,
  },
  markerControls: {
    position: 'absolute',
    top: 120,
    left: 20,
    flexDirection: 'row',
    zIndex: 8,
  },
  markerButton: {
    backgroundColor: '#2E3B55',
    padding: 12,
    borderRadius: 30,
    marginRight: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: 60, // Increased width
    height: 60, // Increased height
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerButtonText: {
    color: '#fff',
    fontSize: 16, // Reduced font size further for better visibility
    fontWeight: 'bold',
  },
  markerTypeButton: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: 60, // Increased width
    height: 60, // Increased height
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2E3B55',
  },
  markerTypeText: {
    fontSize: 18, // Increased font size for better visibility
  },
  placementInstructions: {
    position: 'absolute',
    top: 180,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 193, 7, 0.9)',
    padding: 12,
    borderRadius: 8,
    zIndex: 7,
  },
  instructionText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    margin: 20,
    maxHeight: '80%',
    width: '90%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E3B55',
    marginBottom: 20,
    textAlign: 'center',
  },
  markerTypeOption: {
    flex: 1,
    alignItems: 'center',
    padding: 15,
    margin: 5,
    borderRadius: 10,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedMarkerType: {
    borderColor: '#2E3B55',
    backgroundColor: '#e3f2fd',
  },
  markerTypeEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  markerTypeTitle: {
    fontSize: 14, // Adjusted font size
    color: '#333',
    textAlign: 'center', // Ensure text stays centered and in one line
    fontWeight: '500',
    // Removed flexWrap and whiteSpace as they are not supported in React Native
  },
  closeModalButton: {
    backgroundColor: '#2E3B55',
    padding: 15,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center',
  },
  closeModalText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  tripButton: {
    position: 'absolute',
    bottom: 40,
    left: '10%',
    right: '10%',
    backgroundColor: '#2E3B55',
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    zIndex: 2,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  tripButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  stopButton: {
    position: 'absolute',
    bottom: 40,
    right: 20,
    backgroundColor: '#FF4757',
    padding: 15,
    borderRadius: 50,
    zIndex: 2,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 12, 
    fontWeight: '600',
  },
  speedLimitBadge: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#2E3B55',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  speedLimitText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2E3B55',
  },
  bottomInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(46, 59, 85, 0.95)',
    padding: 20,
    paddingBottom: 35,
    zIndex: 1,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  bottomText: {
    color: '#fff',
    fontSize: 16,
    marginVertical: 4,
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  recenterButton: {
    position: 'absolute',
    top: 120,
    right: 20,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: 45,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recenterText: {
    fontSize: 22,
  },
  carMarkerWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(206, 179, 179, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },  carImage: {
    width: 30,
    height: 30,
  },
  routeNotification: {
    position: 'absolute',
    top: 220,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 87, 34, 0.95)',
    padding: 15,
    borderRadius: 12,
    zIndex: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  routeNotificationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  weatherAlert: {
    position: 'absolute',
    top: 180,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 15,
    padding: 20,
    zIndex: 11,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    borderLeftWidth: 5,
    borderLeftColor: '#FF6B35',
  },
  weatherAlertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weatherAlertTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E3B55',
    flex: 1,
  },
  closeAlertText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
    paddingLeft: 10,
  },
  weatherAlertMessage: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
  },
  weatherDetails: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  weatherButton: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    backgroundColor: 'rgba(46, 59, 85, 0.9)',
    padding: 12,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minWidth: 80,
    alignItems: 'center',
  },
  weatherButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  forecastButton: {
    position: 'absolute',
    top: 120,
    right: 90,
    backgroundColor: 'rgba(46, 59, 85, 0.9)',
    padding: 12,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    alignItems: 'center',
  },
  forecastButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  forecastModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    margin: 20,
    maxHeight: '90%',
    width: '90%',
  },
  forecastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  forecastTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E3B55',
  },
  closeForecastButton: {
    padding: 5,
  },
  closeForecastText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  forecastList: {
    maxHeight: 400,
  },
  forecastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginVertical: 5,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  forecastDay: {
    flex: 1,
    alignItems: 'flex-start',
  },
  forecastDayName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E3B55',
  },
  forecastDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  forecastWeather: {
    flex: 1,
    alignItems: 'center',
  },
  forecastIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  forecastCondition: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  forecastTemperature: {
    flex: 1,
    alignItems: 'flex-end',
  },
  forecastTempMax: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2E3B55',
  },
  forecastTempMin: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  forecastPrecipitation: {
    marginLeft: 10,
  },
  forecastPrecipText: {
    fontSize: 12,
    color: '#4A90E2',
    fontWeight: '500',
  },
  forecastDisclaimer: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    fontStyle: 'italic',
  },
});

export default Main;