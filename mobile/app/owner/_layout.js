import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/auth';
import { colors } from '../../src/theme';
import { Loader } from '../../src/components/ui';

/** صفحات المستخدم الرئيسي. المستخدم الفرعي يُعاد إلى فرعه. */
export default function OwnerLayout() {
  const { user, booting } = useAuth();
  if (booting) return <Loader />;
  if (!user) return <Redirect href="/" />;
  if (user.role !== 'admin') return <Redirect href={user.store_id ? `/store/${user.store_id}` : '/'} />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_left' }} />
  );
}
