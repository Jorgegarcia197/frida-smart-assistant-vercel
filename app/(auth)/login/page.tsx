'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { OAuthProvider, signInWithPopup } from 'firebase/auth';
import { toast } from '@/components/toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { firebaseAuthClient } from '@/lib/firebase-client';
import Link from 'next/link';

import { login, loginWithFirebaseIdToken } from '../actions';
import { useSession } from 'next-auth/react';

function isBrowserLocalhostHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '[::1]' ||
    h.endsWith('.localhost')
  );
}

export default function Page() {
  const router = useRouter();
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const [isLocalLoginLoading, setIsLocalLoginLoading] = useState(false);
  const [showLocalLogin, setShowLocalLogin] = useState(false);
  const { update: updateSession } = useSession();

  useEffect(() => {
    setShowLocalLogin(isBrowserLocalhostHostname(window.location.hostname));
  }, []);

  const handleMicrosoftSignIn = async () => {
    setIsMicrosoftLoading(true);

    try {
      const provider = new OAuthProvider('microsoft.com');
      const result = await signInWithPopup(firebaseAuthClient, provider);
      const idToken = await result.user.getIdToken();

      const signInResult = await loginWithFirebaseIdToken(idToken);
      if (signInResult.status !== 'success') {
        toast({
          type: 'error',
          description: 'Failed to sign in with Microsoft.',
        });
        return;
      }

      await updateSession();
      router.push('/');
    } catch (error) {
      const firebaseError = error as { code?: string };

      if (firebaseError.code === 'auth/popup-closed-by-user') {
        toast({
          type: 'error',
          description: 'Sign-in popup was closed before completion.',
        });
        return;
      }

      if (firebaseError.code === 'auth/popup-blocked') {
        toast({
          type: 'error',
          description: 'Popup was blocked. Please allow popups and try again.',
        });
        return;
      }

      if (
        firebaseError.code === 'auth/account-exists-with-different-credential'
      ) {
        toast({
          type: 'error',
          description:
            'An account with this email already exists with another sign-in method.',
        });
        return;
      }

      toast({
        type: 'error',
        description: 'Microsoft sign-in failed. Please try again.',
      });
    } finally {
      setIsMicrosoftLoading(false);
    }
  };

  const handleLocalLogin = async (formData: FormData) => {
    setIsLocalLoginLoading(true);
    try {
      const result = await login({ status: 'idle' }, formData);
      if (result.status === 'success') {
        await updateSession();
        router.push('/');
        return;
      }
      if (result.status === 'invalid_data') {
        toast({
          type: 'error',
          description: 'Enter a valid email and password (min. 6 characters).',
        });
        return;
      }
      toast({
        type: 'error',
        description:
          'Sign-in failed. On localhost, set LOCAL_AUTH_TEST_EMAIL and LOCAL_AUTH_TEST_PASSWORD in .env.local (development only).',
      });
    } finally {
      setIsLocalLoginLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl flex flex-col gap-12">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign In</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Sign in with your Microsoft account
          </p>
        </div>
        <div className="px-4 sm:px-16 flex flex-col gap-6">
          <Button
            type="button"
            onClick={handleMicrosoftSignIn}
            disabled={isMicrosoftLoading}
          >
            {isMicrosoftLoading
              ? 'Connecting to Microsoft...'
              : 'Continue with Microsoft'}
          </Button>

          {showLocalLogin ? (
            <div className="flex flex-col gap-4 pt-2 border-t border-border">
              <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Local testing only
              </p>
              <form action={handleLocalLogin} className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="local-email">Email</Label>
                  <Input
                    id="local-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    disabled={isLocalLoginLoading}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="local-password">Password</Label>
                  <Input
                    id="local-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    disabled={isLocalLoginLoading}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isLocalLoginLoading}
                >
                  {isLocalLoginLoading ? 'Signing in…' : 'Sign in (localhost)'}
                </Button>
              </form>
            </div>
          ) : null}

          <p className="text-center text-sm text-gray-600 dark:text-zinc-400">
            Need a new account?{' '}
            <Link
              href="/register"
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            >
              Continue with Microsoft on sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
