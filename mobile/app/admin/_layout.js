import React from 'react';
import { Platform } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../src/auth';
import { colors, font, shadow } from '../../src/theme';
import { Feather, Loader } from '../../src/components/ui';

export default function AdminLayout() {
  const { user, booting } = useAuth();
  const insets = useSafeAreaInsets();

  if (booting) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href={`/store/${user.store_id}`} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.lineSoft,
          height: 60 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
          ...(Platform.OS === 'android' ? { elevation: 8 } : shadow(2)),
        },
        tabBarLabelStyle: { fontFamily: font.bodyBold, fontSize: 11, marginTop: 2 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Overview', tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} /> }}
      />
      <Tabs.Screen
        name="stores"
        options={{ title: 'Stores', tabBarIcon: ({ color, size }) => <Feather name="shopping-bag" size={size - 2} color={color} /> }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: 'Reports', tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size - 2} color={color} /> }}
      />
      <Tabs.Screen
        name="team"
        options={{ title: 'Team', tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Feather name="settings" size={size - 2} color={color} /> }}
      />
    </Tabs>
  );
}
