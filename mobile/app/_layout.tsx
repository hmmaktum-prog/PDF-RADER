import { Stack } from 'expo-router';
import { ThemeProvider, useAppTheme } from './context/ThemeContext';
import { ContinueProvider } from './context/ContinueContext';
import { PasswordProvider } from './context/PasswordContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const RootLayoutNav = () => {
  const { isDark } = useAppTheme();

  const headerBg = isDark ? '#1c1c1e' : '#ffffff';
  const headerTint = isDark ? '#ffffff' : '#000000';
  const borderColor = isDark ? '#2c2c2e' : '#e5e5ea';

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: headerBg },
        headerTintColor: headerTint,
        headerShadowVisible: true,
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: isDark ? '#000000' : '#f2f2f7' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'PDF Power Tools', headerShown: false }} />
      <Stack.Screen name="tools" options={{ title: 'All Tools' }} />
      <Stack.Screen name="screens/merge" options={{ headerShown: false }} />
      <Stack.Screen name="screens/split" options={{ headerShown: false }} />
      <Stack.Screen name="screens/split-by-line" options={{ headerShown: false }} />
      <Stack.Screen name="screens/rotate" options={{ headerShown: false }} />
      <Stack.Screen name="screens/compress" options={{ headerShown: false }} />
      <Stack.Screen name="screens/organize" options={{ headerShown: false }} />
      <Stack.Screen name="screens/remove-pages" options={{ headerShown: false }} />
      <Stack.Screen name="screens/invert" options={{ headerShown: false }} />
      <Stack.Screen name="screens/grayscale" options={{ headerShown: false }} />
      <Stack.Screen name="screens/whitener" options={{ headerShown: false }} />
      <Stack.Screen name="screens/enhance-contrast" options={{ headerShown: false }} />
      <Stack.Screen name="screens/image-to-pdf" options={{ headerShown: false }} />
      <Stack.Screen name="screens/pdf-to-image" options={{ headerShown: false }} />
      <Stack.Screen name="screens/nup" options={{ headerShown: false }} />
      <Stack.Screen name="screens/booklet" options={{ headerShown: false }} />
      <Stack.Screen name="screens/four-up-booklet" options={{ headerShown: false }} />
      <Stack.Screen name="screens/resize" options={{ headerShown: false }} />
      <Stack.Screen name="screens/repair" options={{ headerShown: false }} />
      <Stack.Screen name="screens/auto-process" options={{ headerShown: false }} />
      <Stack.Screen name="screens/ocr" options={{ headerShown: false }} />
      <Stack.Screen name="screens/settings" options={{ headerShown: false }} />
      <Stack.Screen name="screens/reader" options={{ headerShown: false }} />
    </Stack>
  );
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ContinueProvider>
            <PasswordProvider>
              <RootLayoutNav />
            </PasswordProvider>
          </ContinueProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
