'use client';

import { AuthProvider } from '@/lib/auth/context';

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}