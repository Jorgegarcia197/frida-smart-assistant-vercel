'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OAuthProvider, signInWithPopup } from 'firebase/auth';

import { Button } from '@/components/ui/button';
import { firebaseAuthClient } from '@/lib/firebase-client';

import { loginWithFirebaseIdToken } from '../actions';
import { toast } from '@/components/toast';
import { useSession } from 'next-auth/react';

export default function Page() {
  const router = useRouter();
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const { update: updateSession } = useSession();

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
          description: 'Failed to continue with Microsoft.',
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
          description: 'Sign-up popup was closed before completion.',
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

      if (firebaseError.code === 'auth/account-exists-with-different-credential') {
        toast({
          type: 'error',
          description:
            'An account with this email already exists with another sign-in method.',
        });
        return;
      }

      toast({
        type: 'error',
        description: 'Microsoft sign-up failed. Please try again.',
      });
    } finally {
      setIsMicrosoftLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl gap-12 flex flex-col">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign Up</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Create your account with Microsoft
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
          <p className="text-center text-sm text-gray-600 mt-4 dark:text-zinc-400">
            {'Already have an account? '}
            <Link
              href="/login"
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            >
              Sign in
            </Link>
            {' instead.'}
          </p>
        </div>
      </div>
    </div>
  );
}
