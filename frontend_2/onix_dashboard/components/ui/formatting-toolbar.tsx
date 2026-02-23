import React from 'react';
import { Bold, Italic, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Underline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormattingToolbarProps {
  onFormat: (format: string) => void;
  className?: string;
}

export function FormattingToolbar({ onFormat, className }: FormattingToolbarProps) {
  return (
    <div className={cn("flex items-center gap-1 p-1 border rounded-t-md bg-muted/20 border-b-0", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('bold')}
        title="Bold (Ctrl+B)"
        className="h-8 w-8 p-0"
      >
        <Bold className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('italic')}
        title="Italic (Ctrl+I)"
        className="h-8 w-8 p-0"
      >
        <Italic className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('underline')}
        title="Underline (Ctrl+U)"
        className="h-8 w-8 p-0"
      >
        <Underline className="h-4 w-4" />
      </Button>
      
      <div className="w-px h-4 bg-border mx-1" />
      
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('list')}
        title="Bullet List"
        className="h-8 w-8 p-0"
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('ordered-list')}
        title="Numbered List"
        className="h-8 w-8 p-0"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <div className="w-px h-4 bg-border mx-1" />

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('align-left')}
        title="Align Left"
        className="h-8 w-8 p-0"
      >
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('align-center')}
        title="Align Center"
        className="h-8 w-8 p-0"
      >
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onFormat('align-right')}
        title="Align Right"
        className="h-8 w-8 p-0"
      >
        <AlignRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
