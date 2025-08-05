'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentSession } from '@/lib/auth/client';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function Home() {
  const router = useRouter();

  const checkAuthAndRedirect = useCallback(async () => {
    try {
      const session = await getCurrentSession();
      if (session?.user) {
        router.push('/dashboard');
      } else {
        router.push('/auth');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      router.push('/auth');
    }
  }, [router]);

  useEffect(() => {
    checkAuthAndRedirect();
  }, [checkAuthAndRedirect]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <LoadingSpinner size="xl" variant="primary" text="Loading WatchThis..." />
    </div>
  );
}
