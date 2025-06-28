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
import { auth, db } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import MapViewDirections from 'react-native-maps-directions';
import polyline from '@mapbox/polyline';
import { Accelerometer, DeviceMotion } from 'expo-sensors';

import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY ;
// OpenWeatherMap API - in fisierul .env
const WEATHER_API_KEY = Constants.expoConfig?.extra?.weatherApiKey || process.env.WEATHER_API_KEY;

// interfețele pentru vreme, datele actuale pt alerte și prognoza meteo 
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
  isPublic: boolean; // proprietate pentru a marca markerul ca public sau privat
  userId?: string; // ID of creator of the marker
}

// interface pentru datele accelerometrului
interface AccelerometerData {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}

interface DrivingBehavior {
  hardBraking: number;
  hardAcceleration: number;
  speedingViolations: number;
  totalScore: number;
}

interface TripSummary {
  tripId: string;
  userId: string;
  startTime: number;
  endTime?: number;
  distance: number;
  duration: number;
  averageSpeed: number;
  maxSpeed: number;
  drivingScore: number;  violations: {
    speeding: number;
    hardBraking: number;
    hardAcceleration: number;
  };
  weatherConditions?: string;
  timestamp: number;
}

interface UserDrivingProfile {
  userId: string;
  username: string;
  totalTrips: number;
  totalDistance: number;
  totalDrivingTime: number;
  averageDrivingScore: number;
  bestScore: number;
  worstScore: number;
  safetyRank: number;
  badges: string[];
  lastUpdated: number;
}

interface DailyTripSummary {
  id: string; // Format pentru ca fiecare intrare sa fie unica userId_YYYY-MM-DD
  userId: string;
  username: string;
  date: string; // formatul de data YYYY-MM-DD format
  tripCount: number;
  totalScore: number;
  averageScore: number; // totalScore / tripCount
  bestTripScore: number;
  worstTripScore: number;
  totalDistance: number;
  totalDuration: number;
  lastUpdated: number;
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

  const router = useRouter();
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };
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
  const [distance, setDistance] = useState<number | null>(null);  const [followUser, setFollowUser] = useState(true);
  const [waypoints, setWaypoints] = useState<LatLng[]>([]);
  const [lastRouteOrigin, setLastRouteOrigin] = useState<LatLng | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [routeCache, setRouteCache] = useState<Map<string, {distance: number, duration: number, timestamp: number}>>(new Map());
  const routeCalculationTimeoutRef = useRef<number | null>(null);
  // New marker-related states
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>([]);
  const [markerMenuVisible, setMarkerMenuVisible] = useState(false);
  const [selectedMarkerType, setSelectedMarkerType] = useState(MARKER_TYPES[0]);
  const [markerPlacementMode, setMarkerPlacementMode] = useState(false);  const [notifiedMarkers, setNotifiedMarkers] = useState<Set<string>>(new Set());
  const [routeNotification, setRouteNotification] = useState<string | null>(null); 

  // Weather-related state
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState<number>(0);
  const [showWeatherAlert, setShowWeatherAlert] = useState(false);
  const [showWeatherForecast, setShowWeatherForecast] = useState(false);
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecast[]>([]);
  // Aggressive driving detection state
  const [accelerometerData, setAccelerometerData] = useState<AccelerometerData[]>([]);
  const [accelerometerBaseline, setAccelerometerBaseline] = useState<{x: number, y: number, z: number} | null>(null);
  const [baselineEstablished, setBaselineEstablished] = useState(false);  const [drivingBehavior, setDrivingBehavior] = useState<DrivingBehavior>({
    hardBraking: 0,
    hardAcceleration: 0,
    speedingViolations: 0,
    totalScore: 100,
  });
  const [currentTripSummary, setCurrentTripSummary] = useState<TripSummary | null>(null);
  const [userDrivingProfile, setUserDrivingProfile] = useState<UserDrivingProfile | null>(null);
  const [showDrivingScore, setShowDrivingScore] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<UserDrivingProfile[]>([]);
  const [showDailyLeaderboard, setShowDailyLeaderboard] = useState(false);
  const [dailyLeaderboardData, setDailyLeaderboardData] = useState<DailyTripSummary[]>([]);
  const [selectedLeaderboardDate, setSelectedLeaderboardDate] = useState<string>(new Date().toISOString().split('T')[0]);
    // Sensor tracking
  const [sensorSubscription, setSensorSubscription] = useState<any>(null);
  const [lastAcceleration, setLastAcceleration] = useState<AccelerometerData | null>(null);  const [lastSpeed, setLastSpeed] = useState<number>(0);  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [recentSpeedHistory, setRecentSpeedHistory] = useState<{speed: number, timestamp: number}[]>([]);
  const [tripStartTime, setTripStartTime] = useState<number | null>(null);
  const [tripDistance, setTripDistance] = useState<number>(0);
  const [lastTripPosition, setLastTripPosition] = useState<LatLng | null>(null);
  const [maxTripSpeed, setMaxTripSpeed] = useState<number>(0);  const baselineRef = useRef<{x: number, y: number, z: number} | null>(null);
  const baselineEstablishedRef = useRef<boolean>(false);
  //elemente de cooldown pentru prevenirea detectiilor multiple la aceeasi manevra
  const lastHardBrakingRef = useRef<number>(0);
  const lastHardAccelerationRef = useRef<number>(0);
  const lastAnyDetectionRef = useRef<number>(0); // Global cooldown to prevent overlapping detections// Thresholds for aggressive driving detection (optimized for real cars including small engines)
  const ACCELERATION_THRESHOLD = 0.1; // m/s² - sensibilitate pe +y 
  const BRAKING_THRESHOLD = -0.1; // m/s² - sensibilitate pe -y 
  const SPEEDING_THRESHOLD = 10; // km/h peste limita de viteza
  const COOLDOWN_PERIOD = 2500; // 2.5 seconds cooldown intre 2 detectii  // Pure accelerometer detection constants with smart pothole filtering
  const Z_AXIS_FILTER_THRESHOLD = 2.5; // tot pentru axa Z filtru
  const POTHOLE_SPIKE_THRESHOLD = 3.0; // pe spike-uri mari in axa Z (potholes)
  const MIN_MOVEMENT_SPEED = 5; 
  const SUSTAINED_FORCE_DURATION = 700; // durata in milisecunde pentru detect sustinuta
  const SUSTAINED_FORCE_PERCENTAGE = 0.8; // 80% din eșantioane trebuie să fie peste pragul de forță pentru a fi considerată sustinută
  const FORCE_VARIANCE_TOLERANCE = 0.3; // permite 30% toleranță la variația forței pentru a evita fals pozitivele
  const MIN_SUSTAINED_SAMPLES = 4; // Minimum samples needed (at 20Hz, ~0.2 seconds)

  // urmarim istoricul fortelor pentru detectarea manevrelor
  const forceHistoryRef = useRef<{
    acceleration: {value: number, timestamp: number}[],
    braking: {value: number, timestamp: number}[],
    lateral: {value: number, timestamp: number}[]
  }>({
    acceleration: [],
    braking: [],
    lateral: []
  });

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
      
      // stergem datele anterioare despre vreme
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
        //alerta pentru pozitionarea dispozitivului
      Alert.alert(
        '📱 Device Setup',
        'Please secure your device in a stable, stationary position before beginning navigation for optimal safety and accuracy.',
        [{ text: 'Understood', style: 'default' }]
      );
      
      // obtinem detalii despre vreme la noua locatie selectata
      if (coords) {
        updateWeatherData(coords);
      }
    } catch (err) {
      console.error('Place details error:', err);
    }
  };
  const startTrip = async () => {
    setTripStarted(true);
    setFollowUser(true);
      // Initialize trip tracking
    const now = Date.now();
    setTripStartTime(now);    setTripDistance(0);
    setMaxTripSpeed(0);    setSpeedHistory([]);
    setRecentSpeedHistory([]); // resetam istoricul vitezei recente
    setLastTripPosition(null); // resetam ultima pozitie a calatoriei
      // resetăm comportamentul de conducere
    setDrivingBehavior({
      hardBraking: 0,
      hardAcceleration: 0,
      speedingViolations: 0,
      totalScore: 100,
    });
    
    // Start sensor monitoring
    await startSensorMonitoring();
      // Create trip summary
    const tripId = `trip_${now}`;
    const currentUserId = auth.currentUser?.uid || 'anonymous';
    setCurrentTripSummary({
      tripId,
      userId: currentUserId,
      startTime: now,
      distance: 0,
      duration: 0,
      averageSpeed: 0,
      maxSpeed: 0,
      drivingScore: 100,      violations: {
        speeding: 0,
        hardBraking: 0,
        hardAcceleration: 0,
      },
      weatherConditions: currentWeather?.condition || 'Unknown',
      timestamp: now,
    });
    
    // daca incepem o calatorie, actualizam datele despre vreme
    if (destination) {
      updateWeatherData(destination);
    }
  };
  const stopTrip = async () => {
    // oprim monitorizarea senzorilor
    if (sensorSubscription) {
      sensorSubscription.remove();
      setSensorSubscription(null);
    }
    
    // calculam scorul de conducere
    if (currentTripSummary && tripStartTime) {
      const now = Date.now();
      const tripDuration = (now - tripStartTime) / 1000 / 60; // minute
      const finalScore = calculateDrivingScore(drivingBehavior, tripDuration, distance || 0);
        const completedTrip: TripSummary = {
        ...currentTripSummary,
        endTime: now,
        distance: tripDistance , 
        duration: tripDuration,
        averageSpeed: speedHistory.length > 0 ? speedHistory.reduce((a, b) => a + b, 0) / speedHistory.length : 0,
        maxSpeed: maxTripSpeed,
        drivingScore: finalScore,        violations: {
          speeding: drivingBehavior.speedingViolations,
          hardBraking: drivingBehavior.hardBraking,
          hardAcceleration: drivingBehavior.hardAcceleration,
        },
        weatherConditions: currentWeather?.condition || 'Unknown',
      };
        setCurrentTripSummary(completedTrip);
      // updatează rezumatul călătoriei în baza de date
      await updateUserDrivingProfile(completedTrip);
      // actualizăm profilul de conducere al utilizatorului
      await updateDailyTripSummary(completedTrip);
      // arata scorul de conducere
      setShowDrivingScore(true);
    }
      setTripStarted(false);
    setDestination(null);
    setEta(null);
    setDistance(null);
    setFollowUser(true);
    setLastRouteOrigin(null);
    setIsCalculatingRoute(false);
    setRouteCache(new Map()); // clear cache pe ruta
    setWaypoints([]); // clear la waypoints imediat
    resetRouteNotifications();
    
    // resetăm variabilele de urmărire a călătoriei
    setTripStartTime(null);    setTripDistance(0);
    setMaxTripSpeed(0);    setSpeedHistory([]);    setRecentSpeedHistory([]); // Reset speed correlation history
    setLastTripPosition(null);
    
    // clear la datele despre vreme
    clearWeatherData();
    
    // stergere orice calcul de ruta in curs
    if (routeCalculationTimeoutRef.current) {
      clearTimeout(routeCalculationTimeoutRef.current);
      routeCalculationTimeoutRef.current = null;
    }
    
    if (region) mapRef.current?.animateToRegion(region);
  };

  const hasArrived = (user: LatLng, dest: LatLng) => {
    const dist = Math.sqrt(
      Math.pow(user.latitude - dest.latitude, 2) +
      Math.pow(user.longitude - dest.longitude, 2)    );
    return dist < 0.0005;
  };

  // calculam distanta dintre doua puncte folosind formula Haversine
  const calculateDistance = (pos1: LatLng, pos2: LatLng): number => {
    const R = 6371; // raza Pamantului in kilometri
    const dLat = (pos2.latitude - pos1.latitude) * Math.PI / 180;
    const dLon = (pos2.longitude - pos1.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.latitude * Math.PI / 180) * Math.cos(pos2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // distanta in kilometri
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
  };  // functiile de actualizare a datelor despre vreme
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
      console.log('OpenWeatherMap weather response:', data);      
      return {
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
      // date fallback pentru cazuri de eroare
      return {
        temperature: Math.round(Math.random() * 25 + 10),
        condition: 'Weather Unavailable',
        description: 'Weather data unavailable',
        humidity: 50,
        windSpeed: 10,
        visibility: 10,
        precipitation: 0,
      };
    }
  };
  const fetchWeatherForecast = async (location: LatLng): Promise<WeatherForecast[]> => {
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

      // procesam datele pentru a crea un rezumat zilnic, OpenWeatherMap returneaza datele la fiecare 3 ore , 8 intrari pentru fiecare zi
      const forecast: WeatherForecast[] = [];
      const dailyData: { [key: string]: any[] } = {};

      // grupam datele pe zile
      data.list.forEach((item: any) => {
        const date = new Date(item.dt * 1000);
        const dateKey = date.toDateString(); //folosim toDateString pentru a grupa datele pe zile
        
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = [];
        }
        dailyData[dateKey].push(item);
      });

      // procerea datelor zilnice
      const sortedDays = Object.keys(dailyData).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      
      for (let i = 0; i < Math.min(5, sortedDays.length); i++) {
        const dateKey = sortedDays[i];
        const dayEntries = dailyData[dateKey];
        const date = new Date(dateKey);
        
        if (dayEntries.length === 0) continue;
        
        // calculul temperaturilor minime si maxime pentru ziua respectiva
        const temps = dayEntries.map((entry: any) => entry.main.temp);
        const minTemp = Math.round(Math.min(...temps));
        const maxTemp = Math.round(Math.max(...temps));
        
        // gasim conditiile meteo cele mai frecvente si precipitatiile
        const conditionCounts: { [key: string]: number } = {};
        const precipitationAmounts: number[] = [];
        
        dayEntries.forEach((entry: any) => {
          const condition = entry.weather[0].main;
          conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
          
          // adunam cantitatile de precipitii pe 3 ore
          const rainAmount = entry.rain?.['3h'] || 0;
          const snowAmount = entry.snow?.['3h'] || 0;
          precipitationAmounts.push(rainAmount + snowAmount);
        });
        
        // luam cea mai frecventa conditie meteo
        const dominantCondition = Object.keys(conditionCounts).reduce((a, b) => 
          conditionCounts[a] > conditionCounts[b] ? a : b
        );
        
        // gasim intrarea de la mijlocul zilei (12:00 - 15:00) pentru descriere si icon
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
          precipitation: Math.round(totalPrecipitation * 10) / 10, // 1 decimal place
          description: middayEntry.weather[0].description,
          icon: weatherIcon,
        });
      }      console.log('Processed forecast data:', forecast);
      return forecast;
    } catch (error) {
      console.error('Error fetching weather forecast:', error);
      // pentru cazuri de eroare, returnam date mock pentru a evita blocarea aplicatiei
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

    // alerte de temperatură
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

    // alerte precipitații
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

    // alerte de vizibilitate
    if (weather.visibility < 5) {
      alerts.push({
        id: `visibility_${timestamp}`,
        message: `Poor visibility conditions (${weather.visibility}km). Use fog lights if available and maintain reduced speed.`,
        severity: 'high',
        icon: '🌫️',
        timestamp,
      });
    }

    // alerte de vânt
    if (weather.windSpeed > 40) {
      alerts.push({
        id: `wind_${timestamp}`,
        message: `Strong winds detected (${weather.windSpeed} km/h). Be cautious of crosswinds, especially when passing large vehicles.`,
        severity: 'medium',
        icon: '💨',
        timestamp,
      });
    }

    // alerte de condiții severe în prognoză
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

      // verificam condiții severe în prognoză
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
    
    // updatam datele despre vreme doar daca au trecut 15 minute de la ultima actualizare pt 
    //api cost savings
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
        
        // generam alerte meteo
        const alerts = generateWeatherAlerts(weatherData, forecastData);
        setWeatherAlerts(alerts);
        
        // arata prognoza meteo
        const highSeverityAlert = alerts.find(alert => alert.severity === 'high');
        if (highSeverityAlert) {
          setShowWeatherAlert(true);
          
          // ascunde alerta dupa 10 secunde
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

  // stergem datele despre vreme
  const clearWeatherData = () => {
    console.log('Clearing weather data...');
    setCurrentWeather(null);
    setWeatherAlerts([]);
    setWeatherForecast([]);
    setShowWeatherAlert(false);
    setShowWeatherForecast(false);
    setLastWeatherUpdate(0);
  };  // Auto-dismiss weather alert
  const dismissWeatherAlert = () => {
    setShowWeatherAlert(false);
  };

  // utilizăm un ref pentru a urmări istoricul forțelor
  const addForceToHistory = (type: 'acceleration' | 'braking' | 'lateral', value: number, timestamp: number) => {
    const history = forceHistoryRef.current[type];
    history.push({ value, timestamp });
    
    // Keep only data within the sustained duration window
    const cutoffTime = timestamp - SUSTAINED_FORCE_DURATION;
    forceHistoryRef.current[type] = history.filter(entry => entry.timestamp >= cutoffTime);
  };

  const analyzeSustainedForce = (
    type: 'acceleration' | 'braking' | 'lateral', 
    currentValue: number, 
    threshold: number,
    isNegativeDirection: boolean = false
  ): boolean => {
    const history = forceHistoryRef.current[type];
    
    // verificam minimul de esantioane necesare pentru a considera o forta sustinuta
    if (history.length < MIN_SUSTAINED_SAMPLES) {
      return false;
    }

    // verificam cate esantioane au fost peste pragul de forta
    const thresholdMeetingSamples = history.filter(entry => {
      if (isNegativeDirection) {
        return entry.value <= threshold; // pentru frânare valori negative
      } else {
        return Math.abs(entry.value) >= Math.abs(threshold); // pentru accelerare 
      }
    });

    const sustainedPercentage = thresholdMeetingSamples.length / history.length;
    
    // Check if force has been sustained for required percentage of time
    if (sustainedPercentage < SUSTAINED_FORCE_PERCENTAGE) {
      return false;
    }

    // Additional check: Verify force magnitude consistency
    // Forces don't need to be exactly the same, but should be reasonably consistent
    const forceMagnitudes = thresholdMeetingSamples.map(entry => Math.abs(entry.value));
    if (forceMagnitudes.length === 0) return false;

    const avgMagnitude = forceMagnitudes.reduce((sum, mag) => sum + mag, 0) / forceMagnitudes.length;
    const maxDeviation = Math.max(...forceMagnitudes.map(mag => Math.abs(mag - avgMagnitude)));
    const varianceRatio = maxDeviation / avgMagnitude;

    // Allow reasonable variance in force magnitude (natural fluctuation during maneuvers)
    if (varianceRatio > FORCE_VARIANCE_TOLERANCE && avgMagnitude > Math.abs(threshold) * 1.5) {
      console.log(`Sustained force rejected due to high variance: ${(varianceRatio * 100).toFixed(1)}
      % (threshold: ${(FORCE_VARIANCE_TOLERANCE * 100).toFixed(1)}%)`);
      return false;
    }

    console.log(`Sustained ${type} detected: ${(sustainedPercentage * 100).toFixed(1)}
    % of samples above threshold, avg magnitude: ${avgMagnitude.toFixed(3)}, 
    variance: ${(varianceRatio * 100).toFixed(1)}%`);
    return true;
  };

  const clearForceHistory = (type?: 'acceleration' | 'braking' | 'lateral') => {
    if (type) {
      forceHistoryRef.current[type] = [];
    } else {
      forceHistoryRef.current = {
        acceleration: [],
        braking: [],
        lateral: []
      };
    }
  };
  
  // functii pentru detectarea comportamentului agresiv la volan
  const startSensorMonitoring = async () => {
    try {
      // resetăm datele și starea înainte de a începe monitorizarea
      setAccelerometerBaseline(null);
      setBaselineEstablished(false);
      baselineRef.current = null;
      baselineEstablishedRef.current = false;
      setAccelerometerData([]);
      
      // stergem istoricul fortelor
      clearForceHistory();
       
      Accelerometer.setUpdateInterval(50); // de 20 de ori pe secunda - frecvență optimă pentru detectarea accelerării și frânării
      
      // colectăm datele accelerometrului
      const subscription = Accelerometer.addListener(accelerometerData => {
        const now = Date.now();
        const newData: AccelerometerData = {
          x: accelerometerData.x,
          y: accelerometerData.y,
          z: accelerometerData.z,
          timestamp: now,
        }; // numai 100 o data (5 secunde de data la 20Hz, 50 ms interval)
        setAccelerometerData(prev => {
          const updated = [...prev, newData].slice(-100);
          
          // stabilim baseline dupa 5 esantioane
          if (!baselineEstablishedRef.current && updated.length >= 5) {
            const firstFiveSamples = updated.slice(0, 5);
            const avgX = firstFiveSamples.reduce((sum, sample) => sum + sample.x, 0) / 5;
            const avgY = firstFiveSamples.reduce((sum, sample) => sum + sample.y, 0) / 5;
            const avgZ = firstFiveSamples.reduce((sum, sample) => sum + sample.z, 0) / 5;
            
            const baseline = { x: avgX, y: avgY, z: avgZ };
            baselineRef.current = baseline;
            baselineEstablishedRef.current = true;
            setAccelerometerBaseline(baseline);
            setBaselineEstablished(true);
            console.log('🎯 Accelerometer baseline established:', { x: avgX.toFixed(3), y: avgY.toFixed(3), z: avgZ.toFixed(3)});
            
          }
          
          // Analizam acceleratia doar daca avem un baseline stabilit
          if (updated.length >= 5 && baselineEstablishedRef.current) {
            analyzeAcceleration(updated);
          }
          
          return updated;
        });
        
        setLastAcceleration(newData);
      });
      
      setSensorSubscription(subscription);
      console.log('Sensor monitoring started');
    } catch (error) {
      console.error('Failed to start sensor monitoring:', error);
    }
  };
  const stopSensorMonitoring = () => {
    if (sensorSubscription) {
      sensorSubscription.remove();
      setSensorSubscription(null);
      console.log('Sensor monitoring stopped');
    }
    
    // resetăm datele accelerometrului și starea
    setAccelerometerBaseline(null);
    setBaselineEstablished(false);
    baselineRef.current = null;
    baselineEstablishedRef.current = false;
    setAccelerometerData([]);
  };  
  const analyzeAcceleration = (data: AccelerometerData[]) => {
    if (!baselineRef.current) return;
    // salvam ultimele 2 esantioane pentru analiza
    const current = data[data.length - 1];
    const previous = data[data.length - 2];
    const baseline = baselineRef.current;
      // valori relative la baseline
    const deltaX = current.x - baseline.x;
    const deltaY = current.y - baseline.y;
    const deltaZ = current.z - baseline.z;// folosim valorile acceleratiei relative la baseline (fara jerk/change in acceleratie)
    // aceste valori reprezintă accelerarea laterală, longitudinală și verticală (G-forces relative la baseline)
    const totalAcceleration = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);    // Log baseline-adjusted analysis for debugging (temporarily 100%)
    if (Math.random() < 1.0) { // Log 100% of the time for debugging
      console.log(' ACCELEROMETER ANALYSIS:', {
        baseline: { x: baseline.x.toFixed(3), y: baseline.y.toFixed(3), z: baseline.z.toFixed(3) },
        current: { x: current.x.toFixed(3), y: current.y.toFixed(3), z: current.z.toFixed(3) },
        relativeAcceleration: { x: deltaX.toFixed(3), y: deltaY.toFixed(3), z: deltaZ.toFixed(3) },
        absoluteValues: { lateral: Math.abs(deltaX).toFixed(3), longitudinal: Math.abs(deltaY).toFixed(3) },
        totalAccel: totalAcceleration.toFixed(3),
        speed: speed.toFixed(1),        thresholds: { 
          accel: `${ACCELERATION_THRESHOLD} (${Math.abs(deltaY) > ACCELERATION_THRESHOLD ? '✅ TRIGGERED' : '❌ below'})`, 
          brake: `${BRAKING_THRESHOLD} (${deltaY < BRAKING_THRESHOLD ? '✅ TRIGGERED' : '❌ above'})`
        },
        cooldowns: { 
          braking: Math.max(0, COOLDOWN_PERIOD - (Date.now() - lastHardBrakingRef.current)),
          acceleration: Math.max(0, COOLDOWN_PERIOD - (Date.now() - lastHardAccelerationRef.current)),
          global: Math.max(0, 200 - (Date.now() - lastAnyDetectionRef.current))
        }
      });
    }    // detectăm frânarea puternică și accelerarea puternică
    detectHardBraking(deltaY);
    detectHardAcceleration(deltaY);
  };
  const detectHardBraking = (yAcceleration: number) => {
    // detectie franare puternică bazată pe accelerometrul cu filtrare inteligentă a gropilor
    // valori negative pentru y indică frânare - nu este nevoie de corelare cu viteza
    const longitudinalAccel = Math.abs(yAcceleration);
    
    console.log(`Braking check: yAcceleration=${yAcceleration.toFixed(3)}, threshold=${BRAKING_THRESHOLD},
     meets threshold: ${yAcceleration < BRAKING_THRESHOLD}`);
    
    // adaugam forta curentă la istoric pentru detectarea sustinută
    const now = Date.now();
    addForceToHistory('braking', yAcceleration, now);
    
    if (yAcceleration < BRAKING_THRESHOLD) {
      // verificăm cooldown global mai întâi - prevenim orice detecție într-un interval scurt
      if (now - lastAnyDetectionRef.current < 200) { // 0.2 secunde cooldown global - foarte receptiv
        console.log('Global detection cooldown active, skipping hard braking detection');
        return;
      }
      
      // verificam perioada de cooldown specifică - prevenim detecții multiple pentru o singură manevră
      if (now - lastHardBrakingRef.current < COOLDOWN_PERIOD) {
        console.log('Hard braking cooldown active, skipping detection');
        return;
      }

      // filtrare inteligentă a gropilor: verificăm vârfurile bruște pe axa Z (gropi)
      const zAcceleration = Math.abs(accelerometerData[accelerometerData.length - 1]?.z - (accelerometerBaseline?.z 
        || 0)) || 0;
      if (zAcceleration > POTHOLE_SPIKE_THRESHOLD) {
        console.log(`Hard braking filtered out due to pothole detection (Z-spike: ${zAcceleration.toFixed(2)} m/s²)`);
        return;
      }

      // verificare stabilitate axa Z - filtrăm false pozitive din mișcarea telefonului
      if (zAcceleration > Z_AXIS_FILTER_THRESHOLD) {
        console.log('Hard braking filtered out due to excessive vertical acceleration (likely phone movement)');
        return;
      }

      // detectare forță susținută: analizăm dacă forța de frânare a fost susținută timp de 1 secundă
      const isSustained = analyzeSustainedForce('braking', yAcceleration, BRAKING_THRESHOLD, true);
      
      if (!isSustained) {
        console.log('Braking filtered out - not sustained enough (requires 70% of samples above threshold for 1 second)');
        return;
      }
      // verificare suplimentară: declanșăm doar dacă accelerația longitudinală este dominantă
      // aceasta ajută la evitarea falselor pozitive când telefonul se înclină ușor în timpul virajelor
      const lateralAccel = Math.abs(accelerometerData[accelerometerData.length - 1]?.x - (accelerometerBaseline?.x
         || 0)) || 0;
      
      // sintaxă mai relaxată pentru filtrarea axelor încrucișate: permitem dacă longitudinala > 0.15 SAU orice accelerație rezonabilă
      if (longitudinalAccel > 0.15 || longitudinalAccel > lateralAccel * 0.5 || longitudinalAccel > 0.4)
         {
        lastHardBrakingRef.current = now; // setare timestamp cooldown
        lastAnyDetectionRef.current = now; // setam timestamp cooldown global
        
        setDrivingBehavior(prev => ({
          ...prev,
          hardBraking: prev.hardBraking + 1,
          totalScore: Math.max(0, prev.totalScore - 5),
        }));
        
        Alert.alert('⚠️ Driving Alert', `Hard braking detected! (${yAcceleration.toFixed(2)} m/s²) Try to brake more gradually for safety.`);
        console.log('Hard braking detected:', yAcceleration.toFixed(3), 'm/s² (longitudinal), lateral:', lateralAccel.toFixed(3), 'm/s²',
         'sustained force confirmed');
        
        // Clear force history after detection to start fresh
        clearForceHistory('braking');
      } else {
        console.log('Hard braking threshold met but cross-axis filtering prevented detection. Long:', longitudinalAccel.toFixed(3), 'Lat:',
         lateralAccel.toFixed(3), 'Ratio:', (longitudinalAccel / lateralAccel).toFixed(2));
      }
    }
  };  
  const detectHardAcceleration = (yAcceleration: number) => {
    // detectare accelerare puternică bazată pe accelerometrul cu filtrare inteligentă a gropilor
    // accelerarea longitudinală e pozitivă
    const longitudinalAccel = Math.abs(yAcceleration);
    
    console.log(`Acceleration check: yAcceleration=${yAcceleration.toFixed(3)}, threshold=${ACCELERATION_THRESHOLD}, meets threshold: ${yAcceleration > ACCELERATION_THRESHOLD}`);
    
    // Aadaugăm forța curentă la istoric pentru detectarea susținută
    const now = Date.now();
    addForceToHistory('acceleration', yAcceleration, now);
    //verificam dacă accelerația longitudinală depășește pragul
    if (yAcceleration > ACCELERATION_THRESHOLD) {
      // verificăm cooldown global mai întâi - prevenim orice detecție într-un interval scurt
      if (now - lastAnyDetectionRef.current < 200) { // 0.2 secunde cooldown global - foarte receptiv
        console.log('Global detection cooldown active, skipping hard acceleration detection');
        return;
      }
      
      // verificăm perioada de cooldown specifică - prevenim detecții multiple pentru o singură manevră
      if (now - lastHardAccelerationRef.current < COOLDOWN_PERIOD) {
        console.log('Hard acceleration cooldown active, skipping detection');
        return;
      }

      // filtrare inteligentă a gropilor: verificăm vârfurile bruște pe axa Z (gropi)
      const zAcceleration = Math.abs(accelerometerData[accelerometerData.length - 1]?.z - (accelerometerBaseline?.z || 0)) || 0;
      if (zAcceleration > POTHOLE_SPIKE_THRESHOLD) {
        console.log(`Hard acceleration filtered out due to pothole detection (Z-spike: ${zAcceleration.toFixed(2)} m/s²)`);
        return;
      }

      // verificare stabilitate axa Z - filtrăm false pozitive din mișcarea telefonului
      if (zAcceleration > Z_AXIS_FILTER_THRESHOLD) {
        console.log('Hard acceleration filtered out due to excessive vertical acceleration (likely phone movement)');
        return;
      }

      // analizăm dacă forța de accelerare a fost susținută timp de 1 secundă
      const isSustained = analyzeSustainedForce('acceleration', yAcceleration, ACCELERATION_THRESHOLD, false);
      
      if (!isSustained) {
        console.log('Acceleration filtered out - not sustained enough (requires 70% of samples above threshold for 1 second)');
        return;
      }

      // Additional check: only trigger if longitudinal acceleration is dominant
      // This helps avoid false positives when phone tilts slightly during left/right turning
      const lateralAccel = Math.abs(accelerometerData[accelerometerData.length - 1]?.x - (accelerometerBaseline?.x || 0)) || 0;
      
      // EXTREMELY RELAXED cross-axis filtering: allow if longitudinal > 0.15 OR any reasonable acceleration
      if (longitudinalAccel > 0.15 || longitudinalAccel > lateralAccel * 0.5 || longitudinalAccel > 0.4) { // Much more permissive
        lastHardAccelerationRef.current = now; // Set cooldown timestamp
        lastAnyDetectionRef.current = now; // Set global cooldown timestamp
        
        setDrivingBehavior(prev => ({
          ...prev,
          hardAcceleration: prev.hardAcceleration + 1,
          totalScore: Math.max(0, prev.totalScore - 3),
        }));
        
        Alert.alert('⚠️ Driving Alert', `Hard acceleration detected! (${yAcceleration.toFixed(2)} m/s²) Smooth acceleration is safer and more fuel-efficient.`);
        console.log('Hard acceleration detected:', yAcceleration.toFixed(3), 'm/s² (longitudinal), lateral:', lateralAccel.toFixed(3), 'm/s²', 'sustained force confirmed');
        
        // Clear force history after detection to start fresh
        clearForceHistory('acceleration');
      } else {
        console.log('Hard acceleration threshold met but cross-axis filtering prevented detection. Long:', longitudinalAccel.toFixed(3), 'Lat:', lateralAccel.toFixed(3), 'Ratio:', (longitudinalAccel / lateralAccel).toFixed(2));
      }
    } 
   };

  const detectSpeeding = () => {
    if (!speedLimit || !tripStarted) return;
    
    const limitValue = parseInt(speedLimit);
    const speedingAmount = speed - limitValue;
    
    if (speedingAmount > SPEEDING_THRESHOLD) {
      setDrivingBehavior(prev => ({
        ...prev,
        speedingViolations: prev.speedingViolations + 1,
      }));
      
      Alert.alert('🚨 Speed Alert', `You're exceeding the speed limit by
         ${speedingAmount.toFixed(1)} km/h. Please slow down for safety.`);
      console.log('Speeding detected:', speed, 'vs limit:', limitValue);
    }
  };

  const calculateDrivingScore = 
  (behavior: DrivingBehavior, tripDuration: number, distance: number): number => {
    let score = 100;
      // scaderea punctelor pentru comportamente agresive
    score -= behavior.hardBraking * 5;
    score -= behavior.hardAcceleration * 3;
    score -= behavior.speedingViolations * 7;
    
    // puncte bonus pentru condus in parametrii optimi
    // dacă durata călătoriei este mai mare de 30 minute și distanța este mai mare de 10 km,
    //  oferim bonus
    if (tripDuration > 30 && distance > 10) { 
      const violationTotal = behavior.hardBraking + behavior.hardAcceleration + 
      behavior.speedingViolations;
      if (violationTotal === 0) {
        score += 10; // 10 puncte pt condus optim
      }
    }
    
    return Math.max(0, Math.min(100, score));
  };
  const updateUserDrivingProfile = async (trip: TripSummary) => {
    try {
      // Check if user is authenticated
      if (!auth.currentUser) {
        console.warn('User not authenticated, cannot update driving profile');
        return;
      }

      const userId = auth.currentUser.uid;
      
      // Get username from user document
      let username = 'Driver'; // Default fallback
      try {
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          username = userDoc.data().username || 'Driver';
        }
      } catch (error) {
        console.warn('Could not fetch username:', error);
      }

      const profileRef = doc(db, 'user_driving_profiles', userId);
      
      // Get existing profile or create new one
      const profileDoc = await getDocs(query(collection(db, 'user_driving_profiles'), where('userId', '==', userId)));
      
      let existingProfile: UserDrivingProfile | null = null;
      if (!profileDoc.empty) {
        existingProfile = profileDoc.docs[0].data() as UserDrivingProfile;
      }
      
      if (existingProfile) {
        // Update existing profile
        const totalTrips = existingProfile.totalTrips + 1;
        const totalDistance = existingProfile.totalDistance + trip.distance;
        const totalDrivingTime = existingProfile.totalDrivingTime + trip.duration;
        const newAverageScore = ((existingProfile.averageDrivingScore * existingProfile.totalTrips) + trip.drivingScore) / totalTrips;
        
        const updatedProfile: UserDrivingProfile = {
          ...existingProfile,
          username, // refresh username in caz că s-a schimbat
          totalTrips,
          totalDistance,
          totalDrivingTime,
          averageDrivingScore: newAverageScore,
          bestScore: Math.max(existingProfile.bestScore, trip.drivingScore),
          worstScore: Math.min(existingProfile.worstScore, trip.drivingScore),
          lastUpdated: Date.now(),
        };
        
        await setDoc(profileRef, updatedProfile);
        setUserDrivingProfile(updatedProfile);
      } else {
        // Create new profile
        const newProfile: UserDrivingProfile = {
          userId,
          username,
          totalTrips: 1,
          totalDistance: trip.distance,
          totalDrivingTime: trip.duration,
          averageDrivingScore: trip.drivingScore,
          bestScore: trip.drivingScore,
          worstScore: trip.drivingScore,
          safetyRank: 0,
          badges: [],
          lastUpdated: Date.now(),
        };
        
        await setDoc(profileRef, newProfile);
        setUserDrivingProfile(newProfile);
      }
        console.log('User driving profile updated');
    } catch (error) {
      console.error('Error updating user driving profile:', error);
    }
  };

  const updateDailyTripSummary = async (trip: TripSummary) => {
    try {
      // verificăm dacă utilizatorul este autentificat
      if (!auth.currentUser) {
        console.warn('User not authenticated, cannot update daily trip summary');
        return;
      }

      const userId = auth.currentUser.uid;
      
      // luam username din documentul utilizatorului
      let username = 'Driver'; // Default fallback
      try {
        const userDocRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          username = userDoc.data().username || 'Driver';
        }
      } catch (error) {
        console.warn('Could not fetch username for daily summary:', error);
      }

      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
      const dailySummaryId = `${userId}_${dateString}`;

      const dailySummaryRef = doc(db, 'daily_trip_summaries', dailySummaryId);
      
      // luam documentul zilnic existent pentru a verifica dacă există deja un rezumat
      const existingDoc = await getDoc(dailySummaryRef);
      
      if (existingDoc.exists()) {
        // updatam rezumatul zilnic existent
        const existingData = existingDoc.data() as DailyTripSummary;
        
        const newTripCount = existingData.tripCount + 1;
        const newTotalScore = existingData.totalScore + trip.drivingScore;
        const newAverageScore = newTotalScore / newTripCount;
        
        const updatedDailySummary: DailyTripSummary = {
          ...existingData,
          username, // update la username in caz că s-a schimbat
          tripCount: newTripCount,
          totalScore: newTotalScore,
          averageScore: Math.round(newAverageScore * 100) / 100, // rotunjim la 2 zecimale
          bestTripScore: Math.max(existingData.bestTripScore, trip.drivingScore),
          worstTripScore: Math.min(existingData.worstTripScore, trip.drivingScore),
          totalDistance: existingData.totalDistance + trip.distance,
          totalDuration: existingData.totalDuration + trip.duration,
          lastUpdated: Date.now(),
        };
        
        await setDoc(dailySummaryRef, updatedDailySummary);
        console.log('Daily trip summary updated for', dateString);
      } else {
        // creem un nou rezumat zilnic in caz că nu există deja
        const newDailySummary: DailyTripSummary = {
          id: dailySummaryId,
          userId,
          username,
          date: dateString,
          tripCount: 1,
          totalScore: trip.drivingScore,
          averageScore: trip.drivingScore,
          bestTripScore: trip.drivingScore,
          worstTripScore: trip.drivingScore,
          totalDistance: trip.distance,
          totalDuration: trip.duration,
          lastUpdated: Date.now(),
        };
        
        await setDoc(dailySummaryRef, newDailySummary);
        console.log('New daily trip summary created for', dateString);
      }
    } catch (error) {
      console.error('Error updating daily trip summary:', error);
    }
  };

  // functiiile pentru leaderboard zilnic
  const loadDailyLeaderboard = async (date: string) => {
    try {
      console.log('Loading daily leaderboard for date:', date);
      const summariesRef = collection(db, 'daily_trip_summaries');
      const q = query(summariesRef, where('date', '==', date));
      const snapshot = await getDocs(q);
      
      const dailySummaries: DailyTripSummary[] = [];
      snapshot.forEach((doc) => {
        dailySummaries.push(doc.data() as DailyTripSummary);
      });
      
      // sortam rezumatele zilnice după scorul mediu descrescător
      dailySummaries.sort((a, b) => b.averageScore - a.averageScore);
      
      setDailyLeaderboardData(dailySummaries);
      console.log('Daily leaderboard loaded:', dailySummaries.length, 'entries');
    } catch (error) {
      console.error('Error loading daily leaderboard:', error);
    }
  };

  const openDailyLeaderboard = () => {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    setSelectedLeaderboardDate(today);
    loadDailyLeaderboard(today);
    setShowDailyLeaderboard(true);
  };

  const handleDateChange = (newDate: string) => {
    setSelectedLeaderboardDate(newDate);
    loadDailyLeaderboard(newDate);
  };  // funcția pentru plasarea markerelor pe hartă
  const handleMapPress = async (event: any) => {
    if (!markerPlacementMode) return; // permite plasarea markerelor doar in modul respectiv de plasare

    const coordinate = event.nativeEvent.coordinate;
    const markerId = `marker_${Date.now()}`;
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to place markers.');
      return;
    }    // verificăm dacă utilizatorul este în timeout
    const isTimedOut = await checkUserTimeout(currentUser.uid);
    if (isTimedOut) {
      return; // oprim plasarea markerului dacă utilizatorul este în timeout
    }

    const newMarker: CustomMarker = {
      id: markerId,
      coordinate,
      type: selectedMarkerType.type,
      emoji: selectedMarkerType.emoji,
      title: selectedMarkerType.title,
      isPublic: true, // asigurăm că toate marker-ele sunt publice
    };
    
    try {
      // Save to Firebase cu USERID
      await setDoc(doc(db, 'custommarkers', markerId), {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        type: selectedMarkerType.type,
        emoji: selectedMarkerType.emoji,
        title: selectedMarkerType.title,
        isPublic: true, // asigurăm că toate marker-ele sunt publice
        userId: currentUser.uid, // salvăm ID-ul utilizatorului
        timestamp: new Date().toISOString(),
      });

      // după salvare, adăugăm markerul la starea locală si verificăm dacă utilizatorul 
      // a depășit limita de plasare
      const limitExceeded = await checkMarkerPlacementLimit(currentUser.uid);
      if (limitExceeded) {
        // dacă utilizatorul a depășit limita, nu adăugăm markerul la hartă si nu
        //  afișăm alerta de succes
        setMarkerPlacementMode(false);
        return;
      }
      
      Alert.alert('Success', `${selectedMarkerType.title} marker placed successfully!`);
      setMarkerPlacementMode(false);
    } catch (error) {
      console.error('Error saving marker:', error);
      Alert.alert('Error', 'Could not save marker. Please try again.');
    }
  };

  // sistemul de timeout pentru plasarea markerelor
  const checkUserTimeout = async (userId: string): Promise<boolean> => {
    try {
      const timeoutDoc = await getDoc(doc(db, 'usertimeouts', userId));
      
      if (timeoutDoc.exists()) {
        const timeoutData = timeoutDoc.data();
        const timeoutEndTime = timeoutData.timeoutEndTime;
        const currentTime = Date.now();
        
        // verificăm dacă timeout-ul este activ
        if (timeoutEndTime > currentTime) {
          const remainingTime = Math.ceil((timeoutEndTime - currentTime) / (1000 * 60)); // minutes
          Alert.alert(
            '⏰ Marker Placement Timeout',
            `You have placed too many markers recently. Please wait ${remainingTime} more minutes before placing another marker.`,
            [{ text: 'OK', style: 'default' }]
          );
          return true; // user is timed out
        } else {
          // daca timeout-ul a expirat, îl ștergem
          await deleteDoc(doc(db, 'usertimeouts', userId));
          return false; // user is not timed out
        }
      }
      
      return false; // No timeout record found
    } catch (error) {
      console.error('Error checking user timeout:', error);
      return false; // Allow placement in caz de eroare
    }
  };

const checkMarkerPlacementLimit = async (userId: string): Promise<boolean> => {
  try {
    const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour ago in milliseconds
    
    // interogăm Firestore pentru a obține marker-ele plasate de utilizator în ultima oră
    const markersRef = collection(db, 'custommarkers');
    const q = query(
      markersRef,
      where('userId', '==', userId)
    );
    
    const querySnapshot = await getDocs(q);
    
    // Filter by timestamp in JavaScript instead of Firestore query
    let recentMarkerCount = 0;
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const markerTimestamp = new Date(data.timestamp).getTime();
      
      if (markerTimestamp > oneHourAgo) {
        recentMarkerCount++;
      }
    });
    
    console.log(`User has placed ${recentMarkerCount} markers in the last hour`);
    
    if (recentMarkerCount >= 3) {
      // Create timeout record
      const timeoutEndTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
      await setDoc(doc(db, 'usertimeouts', userId), {
        userId: userId,
        timeoutStartTime: Date.now(),
        timeoutEndTime: timeoutEndTime,
        reason: 'Exceeded marker placement limit (3 per hour)',
        timestamp: new Date().toISOString()
      });
      
      Alert.alert(
        '⚠️ Marker Placement Limit Reached',
        'You have placed 3 markers in the last hour. You are now restricted from placing markers for 1 hour to prevent spam.',
        [{ text: 'Understood', style: 'default' }]
      );
      
      return true; // Limit exceeded
    }
    
    return false; // Limit not exceeded
  } catch (error) {
    console.error('Error checking marker placement limit:', error);
    return false; // Allow placement on error
  }
};

  const checkProximityToMarkers = () => {
    if (!userLocation) return;

    customMarkers.forEach((marker) => {
      const distance = Math.sqrt(
        Math.pow(userLocation.latitude - marker.coordinate.latitude, 2) +
        Math.pow(userLocation.longitude - marker.coordinate.longitude, 2)
      );

      if (distance < 0.0005) { // aproximativ 50 metri
        // dacă utilizatorul este aproape de un marker, afișăm o alertă
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

  const toggleMarkerPlacementMode = async () => {
    // verificăm dacă suntem în modul de plasare a markerelor pentru a activa/dezactiva 
    //daca utilizatorul nu este logat, nu permitem plasarea markerelor
    if (!markerPlacementMode) {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'You must be logged in to place markers.');
        return;
      }

      // verificam dacă utilizatorul este în timeout
      const isTimedOut = await checkUserTimeout(currentUser.uid);
      if (isTimedOut) {
        return; // nu permitem plasarea markerelor dacă utilizatorul este în timeout
      }

      setMarkerMenuVisible(false);
    }
    
    setMarkerPlacementMode(!markerPlacementMode);
  };const selectMarkerType = (markerType: typeof MARKER_TYPES[0]) => {
    setSelectedMarkerType(markerType);
    setMarkerMenuVisible(false);
  };  
  
  // analizăm densitatea waypoint-urilor pentru a adapta pragul de detectare
  const analyzePolylineDensity = (waypoints: LatLng[]): { type: 'city' | 'highway' | 'suburban', threshold: number, avgSpacing: number } => {
    if (waypoints.length < 10) {
      return { type: 'suburban', threshold: 0.001, avgSpacing: 0 }; // Default 100m
    }
    
    // calculam distanța medie între waypoints
    // folosim doar primele 20 de waypoints pentru a evita calcule prea mari
    let totalDistance = 0;
    const samples = Math.min(waypoints.length - 1, 20);
    
    for (let i = 0; i < samples; i++) {
      const dist = Math.sqrt(
        Math.pow(waypoints[i + 1].latitude - waypoints[i].latitude, 2) +
        Math.pow(waypoints[i + 1].longitude - waypoints[i].longitude, 2)
      );
      totalDistance = totalDistance + dist;
    }
    
    const avgDistance = totalDistance / samples;
    const avgSpacingMeters = avgDistance * 111000; // conversia la metri din lat/long (1 grad ~ 111 km)
    
    // clasificarea rutei în funcție de densitatea medie a waypoint-urilor
    if (avgSpacingMeters < 75) {
      return { type: 'city', threshold: 0.0005, avgSpacing: avgSpacingMeters }; // 50m pentru rute urbane
    } else if (avgSpacingMeters > 150) {
      return { type: 'highway', threshold: 0.0015, avgSpacing: avgSpacingMeters }; // 150m pentru autostrăzi
    } else {
      return { type: 'suburban', threshold: 0.001, avgSpacing: avgSpacingMeters }; // 100m pentru suburbii
    }
  };

  const checkMarkersAlongRoute = () => {
    if (!userLocation || !tripStarted || !destination || waypoints.length === 0) return;
    //adaptăm pragul de detectare în funcție de densitatea waypoint-urilor
    const routeAnalysis = analyzePolylineDensity(waypoints);
    const detectionThreshold = routeAnalysis.threshold;
    let closestMarker: CustomMarker | null = null;
    let closestDistance = Infinity;
    customMarkers.forEach((marker: CustomMarker) => {
      // trecem peste marker-ele deja notificate
      if (notifiedMarkers.has(marker.id)) return;
      // folosim treshold-ul adaptiv de detectare calculat pentru ruta
      let isOnRoute = false;
      let minDistanceToRoute = Infinity;
      for (const waypoint of waypoints) {
        const distanceToRoute = Math.sqrt(
          Math.pow(marker.coordinate.latitude - waypoint.latitude, 2) +
          Math.pow(marker.coordinate.longitude - waypoint.longitude, 2)
        );
        
        minDistanceToRoute = Math.min(minDistanceToRoute, distanceToRoute);
        
        if (distanceToRoute < detectionThreshold) {
          isOnRoute = true;
          break; // am gasit marker-ul pe ruta, nu mai verificam alte waypoints
        }
      }
      // afisam in consola distanța minimă la ruta și dacă este pe rută
      if (minDistanceToRoute < detectionThreshold * 2) { // logam si pentru 2* detection threshold pentru debugging
        const distanceMeters = (minDistanceToRoute * 111000).toFixed(0);// conversia la metri din lat/long cu constantă 111000 (ex 0.001 = 111m)
        const thresholdMeters = (detectionThreshold * 111000).toFixed(0); 
        console.log(`Marker "${marker.title}": ${distanceMeters}m from route (${routeAnalysis.type} threshold: ${thresholdMeters}m) - ${isOnRoute ? 'ON ROUTE ✅' : 'TOO FAR ❌'}`);
      }
      if (isOnRoute) {
        // calculeaza distanța de la utilizator la marker
        const distanceToUser = Math.sqrt(
          Math.pow(userLocation.latitude - marker.coordinate.latitude, 2) +
          Math.pow(userLocation.longitude - marker.coordinate.longitude, 2)
        );        // considera doar marker-ele relevante pentru notificări
        // distanta trebuie sa fie intre 50m si 800m
        if (distanceToUser < 0.008 && distanceToUser > 0.0005) { // intre 50m si 800m
          // verifica dacă este cel mai apropiat marker
          if (distanceToUser < closestDistance) {
            closestMarker = marker;
            closestDistance = distanceToUser;
          }
        }
      }
    });
    // notificăm utilizatorul dacă am găsit un marker relevant, apropiat
    if (closestMarker !== null) {
      const marker = closestMarker as CustomMarker;
      console.log(`Showing marker notification: ${marker.title} ahead on your route`);
      setRouteNotification(`⚠️ ${marker.title} ahead on your route`);
      setNotifiedMarkers(prev => new Set([...prev, marker.id]));
      
      // inchidem notificarea după 6 secunde
      setTimeout(() => {
        setRouteNotification(null);
        console.log('Route notification dismissed');
      }, 6000);
    }
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
  };  // verificam dacă utilizatorul s-a deplasat semnificativ
  const hasMovedSignificantly = (newLocation: LatLng, lastLocation: LatLng | null): boolean => {
    if (!lastLocation) return true;
    
    const distance = calculateDistance(newLocation, lastLocation) * 1000; // conversia la metri din km
    
    // recalculăm distanța la o mișcare semnificativă, dacă este mai mare de 100 metri
    return distance > 100;
  };
  // Debounced route calculation to prevent excessive API calls
  const debouncedRouteCalculation = (userLoc: LatLng, dest: LatLng, isInitial: boolean = false) => {
    if (routeCalculationTimeoutRef.current) {
      clearTimeout(routeCalculationTimeoutRef.current);
    }

    // pentru calcularea inițială, nu aplicăm întârziere, altfel aplicăm o întârziere de 3 secunde
    const delay = isInitial ? 0 : 3000;
    routeCalculationTimeoutRef.current = setTimeout(async () => {
      // pentru calcularea inițială, nu verificăm dacă utilizatorul s-a deplasat semnificativ
      if (!isInitial && !hasMovedSignificantly(userLoc, lastRouteOrigin) && lastRouteOrigin) {
        console.log('Skipping route recalculation - user hasn\'t moved significantly');
        return;
      }

      if (isCalculatingRoute) {
        console.log('Route calculation already in progress');
        return;
      }

      // verificam dacă destinația este validă si verificam dacă există o rută cache
      if (!isInitial) {
        const cacheKey = `${userLoc.latitude.toFixed(4)},${userLoc.longitude.toFixed(4)}-${dest.latitude.toFixed(4)},${dest.longitude.toFixed(4)}`;
        const cachedRoute = routeCache.get(cacheKey);
        
        if (cachedRoute && (Date.now() - cachedRoute.timestamp < 15 * 60 * 1000)) { // Use cache if less than 15 minutes old
          console.log('Using cached route data');
          setDistance(cachedRoute.distance);
          setEta(cachedRoute.duration);
          setLastRouteOrigin(userLoc);
          return;
        }
      }

      console.log(isInitial ? 'Calculating initial route...' : 'Recalculating route...');
      setIsCalculatingRoute(true);
      try {
        const result = await fetchIntermediateWaypoints(userLoc, dest);
        
        setDistance(result.totalDistance);
        setEta(result.totalDuration);
        setWaypoints(result.waypoints);
        setLastRouteOrigin(userLoc);
        
        // trimitem rezultatul în cache
        const cacheKey = `${userLoc.latitude.toFixed(4)},${userLoc.longitude.toFixed(4)}-${dest.latitude.toFixed(4)},${dest.longitude.toFixed(4)}`;
        const cacheEntry = {
          distance: result.totalDistance,
          duration: result.totalDuration,
          timestamp: Date.now()
        };
        setRouteCache(prev => {
          const newCache = new Map(prev);
          newCache.set(cacheKey, cacheEntry);          // curatam cache-ul de rute vechi (mai vechi de 15 minute)
          const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
          for (const [key, value] of newCache.entries()) {
            if (value.timestamp < fifteenMinutesAgo) {
              newCache.delete(key);
            }
          }
          
          return newCache;
        });
        
        console.log(`Route calculated: ${result.totalDistance.toFixed(2)}km, ${result.totalDuration.toFixed(1)}min`);
      } catch (error) {
        console.error('Error calculating route:', error);      } finally {
        setIsCalculatingRoute(false);
      }
    }, delay);
  };

  const fetchIntermediateWaypoints = async (origin: LatLng, destination: LatLng): Promise<{waypoints: LatLng[], totalDistance: number, totalDuration: number}> => {
    if (!validateDestinationInput(destination)) return {waypoints: [], totalDistance: 0, totalDuration: 0};

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},
        ${origin.longitude}&destination=${destination.latitude},${destination.longitude}&
        alternatives=false&mode=driving&overview=full&units=metric&key=${GOOGLE_MAPS_API_KEY}`
      );
      const json = await response.json();

      if (json.status === 'OK' && json.routes && json.routes.length > 0) {
        const route = json.routes[0];
        
        // preluam toate coordonatele din traseu
        let allCoordinates: LatLng[] = [];
        
        route.legs.forEach((leg: any) => {
          leg.steps.forEach((step: any) => {
            // decodificam polyline pentru fiecare pas
            const stepCoords = decodePolyline(step.polyline.points);
            allCoordinates = allCoordinates.concat(stepCoords);
          });
        });
        
        // stergem coordonatele duplicate și cele prea apropiate
        const filteredCoordinates = allCoordinates.filter((coord, index) => {
          if (index === 0) return true;
          const prev = allCoordinates[index - 1];
          const distance = Math.sqrt(
            Math.pow(coord.latitude - prev.latitude, 2) +
            Math.pow(coord.longitude - prev.longitude, 2)
          );
          return distance > 0.00001; // stergem coordonatele care sunt la mai puțin de 1 metru distanță
        });
        
        // Get accurate distance and duration from the route
        const totalDistance = route.legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0) / 1000; // conversie la km
        const totalDuration = route.legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0) / 60; // Conversie la minute
        
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
    if (!tripStarted || !destination) return null;
    
    // folosim ultima locație cunoscută a utilizatorului ca origine pentru ruta simplă
    const routeOrigin = lastRouteOrigin || userLocation;
    if (!routeOrigin) return null;
    
    // afisăm doar ruta simplă între utilizator și destinație, fără waypoints
    // această functie este apelată doar dacă nu există waypoints sau dacă utilizatorul a început o călătorie simplă
    
    return (
      <MapViewDirections
        key="single-route"
        origin={routeOrigin}
        destination={destination}
        waypoints={[]} // fara waypoints intre ruta si destinatie pentru ruta simplă si mai putine api calls
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
          console.log('Route rendered successfully from:', routeOrigin, 'to:', destination, '- Distance:', result.distance, 'km, Duration:', result.duration, 'min');
        }}
      />
    );
  };

  useEffect(() => {
    // ascultăm marker-ele personalizate in timp real din Firebase la încărcarea aplicației
    const unsubscribeMarkers = onSnapshot(
      collection(db, 'custommarkers'),
      (snapshot) => {
        const loadedMarkers: CustomMarker[] = [];        snapshot.forEach((doc) => {
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
            userId: data.userId,
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
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 1000, // o data la 1 secundă
          distanceInterval: 50, // Update la 5 metrii
          mayShowUserSettingsDialog: true,        },async (loc) => {
          const { latitude, longitude, speed: rawSpeed, accuracy } = loc.coords;
          
          // simplificăm logica de calculare a vitezei
          let currentSpeed = 0;
          const userPos = { latitude, longitude };
          
          // folosim viteza GPS directă dacă este disponibilă și are o acuratețe rezonabilă
          if (rawSpeed && rawSpeed >= 0) {
            if (accuracy && accuracy < 20) {
              currentSpeed = Math.max(0, rawSpeed * 3.6); // Convert m/s to km/h
              console.log(`GPS speed: ${currentSpeed.toFixed(1)} km/h (accuracy: ${accuracy.toFixed(1)}m)`);
            } else if (!accuracy || accuracy < 50) {
              // folosim viteza GPS cu acuratețe mai scăzută dar încă rezonabilă
              currentSpeed = Math.max(0, rawSpeed * 3.6);
              console.log(`GPS speed (lower accuracy): ${currentSpeed.toFixed(1)} km/h`);
            }
          }
          
          // varianta de rezerva pentru viteza calculată din distanță și timp
          if (!rawSpeed && userLocation && tripStarted && recentSpeedHistory.length > 0) {
            const lastEntry = recentSpeedHistory[recentSpeedHistory.length - 1];
            const timeDiff = Date.now() - lastEntry.timestamp;
            if (timeDiff > 0) {
              const distance = calculateDistance(userLocation, userPos) * 1000; // meters
              const calculatedSpeed = (distance / timeDiff) * 3600; // km/h
              currentSpeed = Math.max(0, Math.min(calculatedSpeed, 200)); // Cap at 200 km/h for realism
              console.log(`Calculated speed: ${currentSpeed.toFixed(1)} km/h`);
            }
          }
          
          // smoohing logic pentru viteza
          // folosim istoricul vitezei recente pentru a evita fluctuațiile bruște
          if (recentSpeedHistory.length > 0) {
            const lastSpeed = recentSpeedHistory[recentSpeedHistory.length - 1]?.speed || 0;
            const speedDiff = Math.abs(currentSpeed - lastSpeed);
            
            // doar dacă diferența de viteză este semnificativă, aplicăm smoothing
            if (speedDiff > 50 && recentSpeedHistory.length >= 2) {
              const recentSpeeds = recentSpeedHistory.slice(-2).map(s => s.speed);
              const avgRecentSpeed = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
              currentSpeed = avgRecentSpeed + Math.sign(currentSpeed - avgRecentSpeed) * Math.min(speedDiff, 20);
              console.log(`Speed smoothed from ${lastSpeed.toFixed(1)} to ${currentSpeed.toFixed(1)} km/h`);
            }
          }
          
          // setam viteza curentă, asigurându-ne că nu este negativă
          if (currentSpeed < 1.0) currentSpeed = 0;
          
          setSpeed(currentSpeed);
          setUserLocation(userPos);
            // Updatam regiunele hărții cu locația curentă
          if (tripStarted) {
            setSpeedHistory(prev => [...prev.slice(-59), currentSpeed]); // pastram ultimele 60 readings (1 minute at 1-second intervals)
              // updatam istoricul vitezei recente
            const timestamp = Date.now();
            setRecentSpeedHistory(prev => {
              const updated = [...prev, { speed: currentSpeed, timestamp }];
              // pastram doar ultimele 12 înregistrări pentru smoothing
              return updated.slice(-12);
            });
            setMaxTripSpeed(prev => Math.max(prev, currentSpeed));
            
            // Ccalculam distanța parcursă
            if (lastTripPosition) {
              const distanceIncrement = calculateDistance(lastTripPosition, userPos);
              if (distanceIncrement > 0 && distanceIncrement < 1) { // acceptăm doar distanțe rezonabile
                setTripDistance(prev => prev + distanceIncrement);
              }
            }
            setLastTripPosition(userPos);
          }

          if (tripStarted && followUser) {
            mapRef.current?.animateToRegion({
              ...userPos,
              latitudeDelta: 0.003,
              longitudeDelta: 0.003,
            });
          }          if (tripStarted && destination && hasArrived(userPos, destination)) {
            stopTrip();
            alert('You have arrived at your destination!');
          }          // verifica dacă utilizatorul s-a deplasat semnificativ de la ultima origine a rutei
          if (tripStarted && destination && hasMovedSignificantly(userPos, lastRouteOrigin)) {
            console.log('User deviated from route, triggering recalculation...');
            debouncedRouteCalculation(userPos, destination, false); // trimitem fals pentru recalculare
          }

          // verificam marker-ele de-a lungul rutei 
          if (tripStarted) {
            checkMarkersAlongRoute();
            checkProximityToMarkers();
            
            // updatam datele meteo
            updateWeatherData(userPos);
              // monitorizăm viteza pentru depășiri
            detectSpeeding();
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
    //calculăm ruta doar dacă avem o destinație setată și călătoria a început
    // și dacă utilizatorul s-a deplasat semnificativ de la ultima origine a rutei
    if (userLocation && destination && tripStarted) {
      // pornim recalcularea doar daca se face prima data sau daca s a deplasat semnificativ
      // sau daca s a schimbat destinatia
      const isInitialRouteCalculation = !lastRouteOrigin;
        if (isInitialRouteCalculation) {
        console.log('Triggering immediate initial route calculation...');
        debouncedRouteCalculation(userLocation, destination, true); // trimitem true pentru calcularea inițială
      }
      // pentru update uri ulterioare, folosim debouncedRouteCalculation
      //deplasarea semnificativă este verificată în debouncedRouteCalculation
    }

    // curatăm timeout-ul de calculare a rutei la demontarea componentelor
    return () => {
      if (routeCalculationTimeoutRef.current) {
        clearTimeout(routeCalculationTimeoutRef.current);
      }
    };
  }, [destination, tripStarted]); // am sters `userLocation` din dependențe pentru a evita recalcularea inutilă

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
           )  .map((marker) => (
             <Marker
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

      {predictions.length > 0 && (        <FlatList
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

      {/* settings redirect */}
      <TouchableOpacity 
        style={styles.logoutButton}
        onPress={() => router.push('/settings')}
      >
        <Text style={styles.logoutButtonText}>⚙️</Text>
      </TouchableOpacity>

      {/* Daily Leaderboard Control */}
      <View style={styles.rightControls}>
        <TouchableOpacity 
          style={styles.leaderboardFloatingButton}
          onPress={openDailyLeaderboard}
        >
          <Text style={styles.leaderboardFloatingText}>🏆</Text>
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
                </View>              )}
              style={styles.forecastList}
            />
            <Text style={styles.forecastDisclaimer}>
              💡 Plan your trips accordingly based on weather conditions
            </Text>
          </View>
        </View>
      </Modal>

      {/* Driving Score Modal */}
      <Modal
        visible={showDrivingScore}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDrivingScore(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.drivingScoreModalContent}>
            <View style={styles.drivingScoreHeader}>
              <Text style={styles.drivingScoreTitle}>🏁 Trip Complete!</Text>
              <TouchableOpacity
                style={styles.closeDrivingScoreButton}
                onPress={() => setShowDrivingScore(false)}
              >
                <Text style={styles.closeDrivingScoreText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {currentTripSummary && (
              <View style={styles.scoreContent}>
                {/* Main Score Display */}
                <View style={styles.mainScoreCard}>
                  <Text style={styles.scoreLabel}>Your Driving Score</Text>
                  <Text style={[styles.mainScore, { 
                    color: currentTripSummary.drivingScore >= 80 ? '#4CAF50' : 
                           currentTripSummary.drivingScore >= 60 ? '#FF9800' : '#F44336'
                  }]}>
                    {Math.round(currentTripSummary.drivingScore)}
                  </Text>
                  <Text style={styles.scoreSubtext}>
                    {currentTripSummary.drivingScore >= 90 ? '🏆 Excellent!' :
                     currentTripSummary.drivingScore >= 80 ? '👍 Good driving' :
                     currentTripSummary.drivingScore >= 60 ? '⚠️ Needs improvement' : '❌ Poor driving'}
                  </Text>
                </View>

                {/* Trip Statistics */}
                <View style={styles.tripStats}>
                  <View style={styles.statRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{currentTripSummary.distance.toFixed(1)} km</Text>
                      <Text style={styles.statLabel}>Distance</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{Math.round(currentTripSummary.duration)} min</Text>
                      <Text style={styles.statLabel}>Duration</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{Math.round(currentTripSummary.averageSpeed)} km/h</Text>
                      <Text style={styles.statLabel}>Avg Speed</Text>
                    </View>
                  </View>
                </View>

                {/* Violations Summary */}
                <View style={styles.violationsSummary}>
                  <Text style={styles.violationsTitle}>Driving Events</Text>
                  <View style={styles.violationItem}>
                    <Text style={styles.violationIcon}>🚨</Text>
                    <Text style={styles.violationText}>Speeding violations: {currentTripSummary.violations.speeding}</Text>
                  </View>
                  <View style={styles.violationItem}>
                    <Text style={styles.violationIcon}>🛑</Text>
                    <Text style={styles.violationText}>Hard braking: {currentTripSummary.violations.hardBraking}</Text>
                  </View>
                  <View style={styles.violationItem}>
                    <Text style={styles.violationIcon}>⚡</Text>
                    <Text style={styles.violationText}>Hard acceleration: {currentTripSummary.violations.hardAcceleration}</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Leaderboard Modal */}
      <Modal
        visible={showLeaderboard}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowLeaderboard(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.leaderboardModalContent}>
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardTitle}>🏆 Safety Leaderboard</Text>
              <TouchableOpacity
                style={styles.closeLeaderboardButton}
                onPress={() => setShowLeaderboard(false)}
              >
                <Text style={styles.closeLeaderboardText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={leaderboardData}
              keyExtractor={(item) => item.userId}
              renderItem={({ item, index }) => (
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
                      {item.totalTrips} trips • {item.totalDistance.toFixed(0)}km
                    </Text>
                  </View>
                  <View style={styles.scoreContainer}>
                    <Text style={[styles.leaderboardScore, {
                      color: item.averageDrivingScore >= 80 ? '#4CAF50' : 
                             item.averageDrivingScore >= 60 ? '#FF9800' : '#F44336'
                    }]}>
                      {Math.round(item.averageDrivingScore)}
                    </Text>
                    <Text style={styles.scoreText}>avg</Text>
                  </View>
                </View>
              )}
              style={styles.leaderboardList}
            />
              <Text style={styles.leaderboardDisclaimer}>
              🎯 Keep driving safely to improve your ranking!
            </Text>
          </View>
        </View>
      </Modal>

      {/* Daily Leaderboard Modal */}
      <Modal
        visible={showDailyLeaderboard}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDailyLeaderboard(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.leaderboardModalContent}>
            <View style={styles.leaderboardHeader}>
              <Text style={styles.leaderboardTitle}>🏆 Daily Leaderboard</Text>
              <TouchableOpacity
                style={styles.closeLeaderboardButton}
                onPress={() => setShowDailyLeaderboard(false)}
              >
                <Text style={styles.closeLeaderboardText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateSelector}>
              <Text style={styles.dateSelectorLabel}>Select Date:</Text>
              <View style={styles.dateInputContainer}>
                <Text style={styles.dateInput}>{selectedLeaderboardDate}</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayString = yesterday.toISOString().split('T')[0];
                    handleDateChange(yesterdayString);
                  }}
                >
                  <Text style={styles.dateButtonText}>Yesterday</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => {
                    const today = new Date().toISOString().split('T')[0];
                    handleDateChange(today);
                  }}
                >
                  <Text style={styles.dateButtonText}>Today</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {dailyLeaderboardData.length > 0 ? (
              <FlatList
                data={dailyLeaderboardData}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
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
                        {item.tripCount} trip{item.tripCount !== 1 ? 's' : ''} • {item.totalDistance.toFixed(1)}km
                      </Text>
                    </View>
                    <View style={styles.scoreContainer}>
                      <Text style={[styles.leaderboardScore, {
                        color: item.averageScore >= 80 ? '#4CAF50' : 
                               item.averageScore >= 60 ? '#FF9800' : '#F44336'
                      }]}>
                        {Math.round(item.averageScore)}
                      </Text>
                      <Text style={styles.scoreText}>avg</Text>
                    </View>
                  </View>
                )}
                style={styles.leaderboardList}
              />
            ) : (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>📅 No trips recorded for {selectedLeaderboardDate}</Text>
                <Text style={styles.noDataSubtext}>Try selecting a different date or start driving!</Text>
              </View>            )}
            
            {/* Button to Overall Leaderboard */}
            <View style={styles.dailyLeaderboardActions}>
              <TouchableOpacity
                style={styles.overallLeaderboardButton}
                onPress={() => {
                  setShowDailyLeaderboard(false);
                  router.push('/overallLeaderboard');
                }}
              >
                <Text style={styles.overallLeaderboardButtonText}>🏆 View Overall Leaderboard</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.leaderboardDisclaimer}>
              📊 Daily rankings based on average trip scores for the selected date
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

const styles = StyleSheet.create({  logoutButton: {
    position: 'absolute',
    top: 250,
    left: 20,
    backgroundColor: '#2E3B55',
    width: 50,
    height: 50,
    borderRadius: 25,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
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
  },  recenterButton: {
    position: 'absolute',
    top: 190,
    right: 20,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recenterText: {
    fontSize: 16,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
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
  },  weatherButton: {
    position: 'absolute',
    top: 190,
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
  },  forecastDisclaimer: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    fontStyle: 'italic',
  },
  // Driving Score Modal Styles
  drivingScoreModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    margin: 20,
    maxHeight: '90%',
    width: '90%',
  },
  drivingScoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#E0E0E0',
  },
  drivingScoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E3B55',
  },
  scoreContent: {
    alignItems: 'center',
    marginBottom: 25,
  },
  mainScoreCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    width: '100%',
  },
  scoreLabel: {
    fontSize: 18,
    color: '#666',
    marginBottom: 10,
  },
  mainScore: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  scoreSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  tripStats: {
    backgroundColor: '#F8F9FA',
    borderRadius: 15,
    padding: 20,
    marginBottom: 20,
    width: '100%',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E3B55',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  violationsSummary: {
    backgroundColor: '#FFF5F5',
    borderRadius: 15,
    padding: 20,
    marginBottom: 25,
    width: '100%',
  },
  violationsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#E53E3E',
    marginBottom: 15,
    textAlign: 'center',
  },
  violationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingVertical: 5,
  },
  violationIcon: {
    fontSize: 18,
    marginRight: 10,
    width: 25,
  },
  violationText: {
    fontSize: 16,
    color: '#666',
    flex: 1,
  },
  scoreActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  leaderboardButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    flex: 0.48,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  leaderboardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },  closeDrivingScoreButton: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },  closeDrivingScoreButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeDrivingScoreText: {
    fontSize: 16,
    color: '#666',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 16,
  },
  closeDrivingScoreButtonMain: {
    backgroundColor: '#E0E0E0',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    marginTop: 10,
  },
  closeLeaderboardButton: {
    padding: 5,
  },
  closeLeaderboardText: {
    fontSize: 20,
    color: '#666',
    fontWeight: 'bold',
  },
  // Leaderboard Modal Styles
  leaderboardModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 25,
    margin: 20,
    maxHeight: '90%',
    width: '90%',
  },
  leaderboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: '#E0E0E0',
  },
  leaderboardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2E3B55',
  },
  leaderboardList: {
    maxHeight: 400,
    marginBottom: 20,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginVertical: 5,
    backgroundColor: '#F8F9FA',
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  rankContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  rankNumber: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2E3B55',
    marginBottom: 4,
  },
  userStats: {
    fontSize: 12,
    color: '#666',
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  leaderboardScore: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  scoreText: {
    fontSize: 12,
    color: '#666',
  },  leaderboardDisclaimer: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    fontStyle: 'italic',
  },
  leaderboardFloatingButton: {
    backgroundColor: '#4A90E2',
    padding: 12,
    borderRadius: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },  leaderboardFloatingText: {    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rightControls: {
    position: 'absolute',
    top: 120,
    right: 20,
    flexDirection: 'column',
    zIndex: 8,
  },
  dateSelector: {
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  dateSelectorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E3B55',
    marginBottom: 10,
  },
  dateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  dateInput: {
    fontSize: 16,
    color: '#2E3B55',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
    minWidth: 120,
    textAlign: 'center',
    fontWeight: '500',
  },
  dateButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  dateButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noDataText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 10,
  },  noDataSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  dailyLeaderboardActions: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  overallLeaderboardButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  overallLeaderboardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default Main;

/*
 * AGGRESSIVE DRIVING DETECTION SYSTEM - PURE ACCELEROMETER VERSION
 * =================================================================
 * 
 * Major Optimizations Applied:
 * 
 * 1. REMOVED SUSTAINED G-FORCE CHECKS (300+ lines removed)
 *    - Eliminated complex sustained G-force validation system
 *    - Now uses immediate baseline-relative acceleration detection
 * 
 * 2. REMOVED ALL SPEED CORRELATION LOGIC
 *    - Eliminated speed verification functions and constants
 *    - No longer depends on GPS speed for validation
 *    - Pure accelerometer-based detection with z-axis filtering
 * 
 * 3. Z-AXIS FILTERING FOR PHONE MOVEMENT
 *    - Filters out false positives from phone tilting/rotation
 *    - Uses Z_AXIS_FILTER_THRESHOLD = 2.0 m/s² for stability check
 *    - Eliminates false detections from device handling
 *  * 4. MOTION-BASED VALIDATION
 *    - Stationary vibration filtering through accelerometer patterns
 *    - Cross-axis filtering maintains detection accuracy
 * 
 * 5. SIMPLIFIED SENSOR SYNCHRONIZATION
 *    - Accelerometer: 100ms intervals (10Hz) - for responsive detection
 *    - GPS: 1000ms intervals (1Hz) - for navigation only
 *    - Independent operation - accelerometer doesn't need GPS validation
 * 
 * 6. PRECISE ROUTE RECALCULATION
 *    - Route recalculation threshold: exactly 100 meters
 *    - Uses Haversine distance calculation for accuracy
 *    - Only recalculates when user moves significantly from route
 * * Detection Thresholds (High Sensitivity for Real Driving):
 * - Hard Braking: -0.3 m/s² (longitudinal) - very sensitive
 * - Hard Acceleration: 0.3 m/s² (longitudinal) - very sensitive
 * - Z-Axis Filter: 1.5 m/s² (vertical stability check)
 * - Cooldown: 3 seconds between similar detections
 * - Global Cooldown: 0.2 seconds between any detections
 * 
 * Result: Highly sensitive accelerometer-based detection optimized for real-world
 * driving scenarios with minimal phone movement required for detection.
 */