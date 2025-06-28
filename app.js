import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from './LoginScreen';
import SignupScreen from './SignupScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
     <Stack.Navigator initialRouteName="Index">
    <Stack.Screen name="Index" component={TabOneScreen} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>

    </NavigationContainer>
  );
}
