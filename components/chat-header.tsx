'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';

import { SidebarToggle } from '@/components/sidebar-toggle';

import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import type { VisibilityType } from './visibility-selector';
import type { Session } from 'next-auth';

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
  session,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session | null;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="flex sticky top-0 bg-background py-3 items-center px-3 md:px-2 gap-2 border-b">
      <div className="px-4">
        <SidebarToggle />
      </div>

      {(!open || windowWidth < 768) && (
        <>
          {/* App Title/Branding - only when sidebar is closed */}
          <div className="flex items-center gap-2 order-1">
            <Link
              href="/"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <span className="hidden md:block">FRIDA AI Assistant</span>
            </Link>
          </div>
        </>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
