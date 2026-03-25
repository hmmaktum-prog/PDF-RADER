import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ThemeType = 'light' | 'dark' | 'system';

interface ThemeContextProps {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextProps>({
  theme: 'system',
  setTheme: () => {},
  isDark: false,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemTheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeType>('system');

  useEffect(() => {
    AsyncStorage.getItem('app-theme').then((t) => {
      if (t) setThemeState(t as ThemeType);
    });
  }, []);

  const setTheme = (t: ThemeType) => {
    setThemeState(t);
    AsyncStorage.setItem('app-theme', t);
  };

  const isDark = theme === 'system' ? systemTheme === 'dark' : theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
