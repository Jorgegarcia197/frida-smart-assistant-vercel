'use server';

import { z } from 'zod/v3';

import { getUser, createUserWithFirebaseAuth } from '@/lib/db/queries';
import {
  getFirebaseUser,
  sendPasswordResetEmail,
} from '@/lib/auth/firebase-auth';

import { signIn } from './auth';

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export interface LoginActionState {
  status: 'idle' | 'in_progress' | 'success' | 'failed' | 'invalid_data';
}

export const login = async (
  _: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    const result = await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    // Check if signIn was successful
    if (result?.error) {
      console.error('SignIn error:', result.error);
      return { status: 'failed' };
    }

    return { status: 'success' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    console.error('Login error:', error);
    return { status: 'failed' };
  }
};

export interface RegisterActionState {
  status:
    | 'idle'
    | 'in_progress'
    | 'success'
    | 'failed'
    | 'user_exists'
    | 'invalid_data';
}

export const register = async (
  _: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    // Check if user already exists in Firebase Auth
    const existingFirebaseUser = await getFirebaseUser(validatedData.email);
    if (existingFirebaseUser) {
      return { status: 'user_exists' } as RegisterActionState;
    }

    // Also check Firestore for compatibility
    const users = await getUser(validatedData.email);
    if (users.length > 0) {
      return { status: 'user_exists' } as RegisterActionState;
    }

    // Create user in both Firebase Auth and Firestore
    await createUserWithFirebaseAuth(
      validatedData.email,
      validatedData.password,
    );

    // Sign in the user
    await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: 'success' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    console.error('Registration error:', error);
    return { status: 'failed' };
  }
};

export interface PasswordResetActionState {
  status:
    | 'idle'
    | 'in_progress'
    | 'success'
    | 'failed'
    | 'invalid_data'
    | 'email_not_found';
}

export const resetPassword = async (
  _: PasswordResetActionState,
  formData: FormData,
): Promise<PasswordResetActionState> => {
  try {
    const emailSchema = z.object({
      email: z.string().email(),
    });

    const validatedData = emailSchema.parse({
      email: formData.get('email'),
    });

    await sendPasswordResetEmail(validatedData.email);
    return { status: 'success' };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 'invalid_data' };
    }

    // Check if it's a specific Firebase Auth error
    if (error instanceof Error && error.message.includes('No account found')) {
      return { status: 'email_not_found' };
    }

    console.error('Password reset error:', error);
    return { status: 'failed' };
  }
};
