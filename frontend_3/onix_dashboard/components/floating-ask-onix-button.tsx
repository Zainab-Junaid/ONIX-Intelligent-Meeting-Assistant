'use client';

import { Bot } from 'lucide-react';
import { OnixBotIcon } from '@/components/icons/onix-bot-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FloatingAskOnixButtonProps {
  onClick: () => void;
  className?: string;
}

export function FloatingAskOnixButton({ onClick, className }: FloatingAskOnixButtonProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-[9999] h-14 w-14 rounded-full shadow-lg",
        "bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-110 transition-transform duration-200",
        "border-2 border-white/20",
        className
      )}
      size="icon"
    >
      <div className="size-10 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm shadow-inner">
        <OnixBotIcon className="size-full" />
      </div>
      <span className="sr-only">Ask Onix</span>
    </Button>
  );
}
