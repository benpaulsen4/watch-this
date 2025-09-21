'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function Layout({children}: {children: React.ReactNode}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      const redirectUrl = encodeURIComponent(pathname);
      router.push(`/auth?redirect=${redirectUrl}`);
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner size="xl" variant="primary" />
      </div>
    );
  }

  if (!user) {
    return null; // Router will redirect
  }

  return <>{children}</>;
}