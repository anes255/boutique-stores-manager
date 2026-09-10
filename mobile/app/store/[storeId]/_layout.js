import React from 'react';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';

import { useAuth } from '../../../src/auth';
import { colors } from '../../../src/theme';
import { Loader } from '../../../src/components/ui';

/**
 * كل محل له مكدّس شاشات خاص به: التبويبات، ثم النماذج (منتج، تموين، مصروف،
 * موظف، أصناف، حساب دخول) فوقها.
 *
 * النماذج كانت في مجموعة /modal مشتركة بين كل المحلات وتستقبل المحل كمعامل،
 * وعلى الهاتف كان المعامل يعود أحيانا بقيمة قديمة من زيارة سابقة، فتُحفظ
 * الإضافات في محل آخر. الآن المحل جزء من المسار نفسه: /store/<id>/product-form
 * فلا يمكن أن يختلف عن المحل الذي تراه.
 */
export default function StoreStack() {
  const { storeId } = useLocalSearchParams();
  const { user, booting } = useAuth();

  if (booting) return <Loader />;
  if (!user) return <Redirect href="/login" />;
  // حساب المحل لا يفتح إلا محله
  if (user.role !== 'admin' && user.store_id !== storeId) {
    return <Redirect href={`/store/${user.store_id}`} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_bottom',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
    </Stack>
  );
}
