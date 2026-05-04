'use client';

import { Sparkles } from 'lucide-react';
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
        "bg-gradient-to-r from-indigo-500 to-purple-600 hover:scale-110 transition-transform duration-200",
        "border-2 border-white/20",
        className
      )}
      size="icon"
    >
      <Sparkles className="size-6 text-white" fill="currentColor" />
      <span className="sr-only">Ask Onix</span>
    </Button>
  );
}
