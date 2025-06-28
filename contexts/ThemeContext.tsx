import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  colors: {
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    card: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Load dark mode preference on component mount
  useEffect(() => {
    loadDarkModePreference();
  }, []);

  const loadDarkModePreference = async () => {
    try {
      const value = await AsyncStorage.getItem('darkMode');
      if (value !== null) {
        setIsDarkMode(JSON.parse(value));
      }
    } catch (error) {
      console.error('Error loading dark mode preference:', error);
    }
  };

  const saveDarkModePreference = async (value: boolean) => {
    try {
      await AsyncStorage.setItem('darkMode', JSON.stringify(value));
    } catch (error) {
      console.error('Error saving dark mode preference:', error);
    }
  };

  const toggleDarkMode = async () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    await saveDarkModePreference(newValue);
  };

  // Define color schemes
  const lightColors = {
    background: '#f5f5f5',
    surface: '#ffffff',
    text: '#333333',
    textSecondary: '#666666',
    border: '#e0e0e0',
    primary: '#2E3B55',
    card: '#ffffff',
  };

  const darkColors = {
    background: '#121212',
    surface: '#1e1e1e',
    text: '#ffffff',
    textSecondary: '#cccccc',
    border: '#333333',
    primary: '#4A90E2',
    card: '#2a2a2a',
  };

  const colors = isDarkMode ? darkColors : lightColors;

  const value: ThemeContextType = {
    isDarkMode,
    toggleDarkMode,
    colors,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
