import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionContext } from '../nav';

export default function RootLayout() {
  const [session, setSession] = useState(null);
  return (
    <SessionContext.Provider value={{ session, setSession }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_left', contentStyle: { backgroundColor: '#e9e6dc' } }} />
    </SessionContext.Provider>
  );
}
