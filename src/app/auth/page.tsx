'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerPasskey, authenticatePasskey, isPasskeySupported, isPlatformAuthenticatorAvailable } from '@/lib/auth/client';
import { Fingerprint, Smartphone, Shield } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type AuthMode = 'signin' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  
  const [mode, setMode] = useState<AuthMode>('signin');
  const [username, setUsername] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [platformAuthAvailable, setPlatformAuthAvailable] = useState(false);

  useEffect(() => {
    // Check passkey support
    const checkSupport = async () => {
      const supported = isPasskeySupported();
      setPasskeySupported(supported);
      
      if (supported) {
        const available = await isPlatformAuthenticatorAvailable();
        setPlatformAuthAvailable(available);
      }
    };
    
    checkSupport();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await registerPasskey({ 
        username: username.trim(), 
        deviceName: deviceName.trim() || undefined 
      });
      
      // Redirect to dashboard on success
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setLoading(true);
    setError('');

    try {
      await authenticatePasskey({ 
        username: username.trim() || undefined 
      });
      
      // Redirect to dashboard on success
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (!passkeySupported) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Card variant="entertainment" className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-600/20">
              <Shield className="h-6 w-6 text-red-400" />
            </div>
            <CardTitle className="text-xl">Passkeys Not Supported</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-400 mb-4">
              Your browser doesn&apos;t support passkeys. Please use a modern browser like Chrome, Safari, or Firefox.
            </p>
            <Button 
              onClick={() => window.location.reload()} 
              variant="outline"
              className="w-full"
            >
              Refresh Page
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
            WatchThis
          </h1>
          <p className="text-gray-400 mt-2">
            Your collaborative movie & TV tracking app
          </p>
        </div>

        {/* Auth Card */}
        <Card variant="entertainment">
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-red-600 to-orange-500">
                <Fingerprint className="h-6 w-6 text-white" />
              </div>
            </div>
            <CardTitle className="text-center">
              {mode === 'register' ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <p className="text-center text-gray-400 text-sm">
              {mode === 'register' 
                ? 'Sign up with your passkey for secure access'
                : 'Sign in with your passkey'
              }
            </p>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={mode === 'register' ? handleRegister : handleSignIn} className="space-y-4">
              {/* Username */}
              <Input
                label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required={mode === 'register'}
                error={error && error.includes('username') ? error : undefined}
              />

              {/* Device Name (Register only) TODO Can we get this from user agent? */}
              {mode === 'register' && (
                <Input
                  label="Device Name (Optional)"
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g., My iPhone, Work Laptop"
                  helperText="Give this device a name for easy identification"
                />
              )}

              {/* Error Message */}
              {error && !error.includes('username') && (
                <div className="p-3 rounded-lg bg-red-600/20 border border-red-500/30">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Platform Auth Warning */}
              {!platformAuthAvailable && (
                <div className="p-3 rounded-lg bg-yellow-600/20 border border-yellow-500/30">
                  <div className="flex items-start gap-2">
                    <Smartphone className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-yellow-400 text-sm font-medium">Limited Passkey Support</p>
                      <p className="text-yellow-300 text-xs mt-1">
                        Your device may not support platform authenticators. You can still use security keys.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                variant="entertainment"
                size="lg"
                className="w-full"
                loading={loading}
                disabled={loading}
              >
                {loading ? (
                  mode === 'register' ? 'Creating Account...' : 'Signing In...'
                ) : (
                  <>
                    <Fingerprint className="mr-2 h-4 w-4" />
                    {mode === 'register' ? 'Create Account with Passkey' : 'Sign In with Passkey'}
                  </>
                )}
              </Button>
            </form>

            {/* Mode Toggle */}
            <div className="mt-6 text-center">
              <p className="text-gray-400 text-sm">
                {mode === 'register' ? 'Already have an account?' : "Don&apos;t have an account?"}
              </p>
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setMode(mode === 'register' ? 'signin' : 'register');
                  setError('');
                  setUsername('');
                  setDeviceName('');
                }}
                className="mt-1"
              >
                {mode === 'register' ? 'Sign In' : 'Create Account'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-center">
          <p className="text-gray-500 text-xs">
            Secured with passkeys - no passwords needed
          </p>
        </div>
      </div>
    </div>
  );
}