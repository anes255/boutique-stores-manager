import React from 'react';
import { Platform } from 'react-native';
import { Redirect, Tabs, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../../../src/auth';
import { colors, font, shadow } from '../../../src/theme';
import { Feather, Loader } from '../../../src/components/ui';

export default function StoreLayout() {
  const { storeId } = useLocalSearchParams();
  const { user, booting } = useAuth();
  const insets = useSafeAreaInsets();

  if (booting) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  // A store account can only ever open its own store.
  if (user.role !== 'admin' && user.store_id !== storeId) {
    return <Redirect href={`/store/${user.store_id}`} />;
  }

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
      <Tabs.Screen name="index"
        options={{ title: 'اليوم', tabBarIcon: ({ color, size }) => <Feather name="home" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="sell"
        options={{ title: 'بيع', tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="products"
        options={{ title: 'المنتجات', tabBarIcon: ({ color, size }) => <Feather name="tag" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="money"
        options={{ title: 'المال', tabBarIcon: ({ color, size }) => <Feather name="credit-card" size={size - 2} color={color} /> }} />
      <Tabs.Screen name="team"
        options={{ title: 'الفريق', tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color} /> }} />
    </Tabs>
  );
}
