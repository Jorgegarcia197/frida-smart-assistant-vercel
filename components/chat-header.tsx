'use client';

import Link from 'next/link';
import { useWindowSize } from 'usehooks-ts';
import { Bot } from 'lucide-react';

import { SidebarToggle } from '@/components/sidebar-toggle';

import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import type { VisibilityType } from './visibility-selector';
import type { Session } from 'next-auth';
import { useAgentForChat } from './agent-provider';

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
  const { open } = useSidebar();
  const { currentAgent } = useAgentForChat(chatId);

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

      {currentAgent && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`Active agent: ${currentAgent.name}`}
          className="ml-auto flex min-w-0 max-w-[min(100%,20rem)] shrink items-center gap-2 rounded-lg border border-green-500/40 bg-green-50/80 px-2.5 py-1.5 dark:bg-green-950/25"
          title={`${currentAgent.name} (${currentAgent.deployment_type})`}
        >
          <Bot
            className="size-4 shrink-0 text-green-700 dark:text-green-400"
            aria-hidden
          />
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-medium leading-none">
                {currentAgent.name}
              </span>
              <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-800 dark:bg-green-900/50 dark:text-green-300">
                Active
              </span>
            </div>
            <span className="truncate text-[11px] text-muted-foreground leading-none">
              {currentAgent.deployment_type}
            </span>
          </div>
        </div>
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
