'use client';

import { useActionState, useEffect, useState } from 'react';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  resetPassword,
  type PasswordResetActionState,
} from '@/app/(auth)/actions';

interface PasswordResetFormProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
}

export function PasswordResetForm({
  isOpen,
  onClose,
  defaultEmail = '',
}: PasswordResetFormProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [state, formAction] = useActionState<
    PasswordResetActionState,
    FormData
  >(resetPassword, {
    status: 'idle',
  });

  useEffect(() => {
    if (!state || !state.status) return;

    if (state.status === 'failed') {
      toast({
        type: 'error',
        description: 'Failed to send password reset email. Please try again.',
      });
    } else if (state.status === 'invalid_data') {
      toast({
        type: 'error',
        description: 'Please enter a valid email address.',
      });
    } else if (state.status === 'email_not_found') {
      toast({
        type: 'error',
        description: 'No account found with this email address.',
      });
    } else if (state.status === 'success' && !isSuccessful) {
      setIsSuccessful(true);
      toast({
        type: 'success',
        description: 'Password reset email sent! Check your inbox.',
      });
    }
  }, [state?.status, isSuccessful]);

  const handleSubmit = (formData: FormData) => {
    setEmail(formData.get('email') as string);
    formAction(formData);
  };

  const handleClose = () => {
    setIsSuccessful(false);
    setEmail('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isSuccessful ? 'Check Your Email' : 'Reset Password'}
          </DialogTitle>
        </DialogHeader>

        {isSuccessful ? (
          <div className="flex flex-col gap-4 py-4">
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              We&apos;ve sent a password reset link to <strong>{email}</strong>
            </div>
            <div className="text-center text-sm text-gray-500 dark:text-gray-500">
              Check your email and click the link to reset your password. The
              link will expire in 1 hour.
            </div>
            <Button onClick={handleClose} className="w-full">
              Got it
            </Button>
          </div>
        ) : (
          <form action={handleSubmit} className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label
                htmlFor="reset-email"
                className="text-zinc-600 font-normal dark:text-zinc-400"
              >
                Email Address
              </Label>
              <Input
                id="reset-email"
                name="email"
                className="bg-muted text-md md:text-sm"
                type="email"
                placeholder="user@acme.com"
                autoComplete="email"
                required
                autoFocus
                defaultValue={defaultEmail}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1">
                Send Reset Link
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
