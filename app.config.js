require('dotenv').config();

export default {
  expo: {
    name: "testing",
    slug: "testing",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "testing",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "AIzaSyAInOrptLN-NBY363L-tomETDhwQlMtu3s",
      weatherApiKey: process.env.WEATHER_API_KEY || "ca0fefa8244e330f1e477274aecd91aa",
      firebaseApiKey: process.env.FIREBASE_API_KEY || "AIzaSyC1NLydQ10qn1plTIeyaKYwwMg7oOZzkik"
    }
  }
};
