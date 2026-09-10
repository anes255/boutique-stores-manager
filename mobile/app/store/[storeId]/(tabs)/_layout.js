import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, shadow } from '../../../../src/theme';
import { Feather } from '../../../../src/components/ui';

/** تبويبات المحل. الحماية (من يحق له فتح هذا المحل) في مكدّس المحل فوقها. */
export default function StoreTabs() {
  const insets = useSafeAreaInsets();

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
