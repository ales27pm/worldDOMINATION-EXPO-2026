import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Alegreya_400Regular,
  Alegreya_400Regular_Italic,
  Alegreya_500Medium,
  Alegreya_500Medium_Italic,
  Alegreya_600SemiBold,
  Alegreya_700Bold,
  Alegreya_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/alegreya';
import {
  IMFellEnglish_400Regular,
  IMFellEnglish_400Regular_Italic,
} from '@expo-google-fonts/im-fell-english';
import { IMFellEnglishSC_400Regular } from '@expo-google-fonts/im-fell-english-sc';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GameProvider } from '@/context/GameContext';
import { TournamentProvider } from '@/context/TournamentContext';
import { StatusBar } from 'expo-status-bar';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ headerShown: false }} />
      <Stack.Screen name="game" options={{ headerShown: false }} />
      <Stack.Screen name="multiplayer" options={{ headerShown: false }} />
      <Stack.Screen name="multiplayer-game" options={{ headerShown: false }} />
      <Stack.Screen name="records" options={{ headerShown: false }} />
      <Stack.Screen name="tournament" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Period typefaces mirroring the web build: IM Fell English SC for engraved
  // display headings, IM Fell English for map labels, Alegreya for body copy.
  const [fontsLoaded, fontError] = useFonts({
    Alegreya_400Regular,
    Alegreya_400Regular_Italic,
    Alegreya_500Medium,
    Alegreya_500Medium_Italic,
    Alegreya_600SemiBold,
    Alegreya_700Bold,
    Alegreya_800ExtraBold,
    IMFellEnglish_400Regular,
    IMFellEnglish_400Regular_Italic,
    IMFellEnglishSC_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <GameProvider>
            <TournamentProvider>
              <StatusBar style="light" />
              <RootLayoutNav />
            </TournamentProvider>
          </GameProvider>
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
