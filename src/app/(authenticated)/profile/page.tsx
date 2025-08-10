import { Suspense } from 'react';
import { ProfileClient } from '@/components/profile/ProfileClient';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function ProfilePage() {
  return (
    <Suspense 
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <LoadingSpinner size="xl" variant="primary" text="Loading profile..." />
        </div>
      }
    >
      <ProfileClient />
    </Suspense>
  );
}