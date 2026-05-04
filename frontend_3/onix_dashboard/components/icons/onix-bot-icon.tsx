
import React from 'react';
import { cn } from '@/lib/utils';

interface OnixBotIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export function OnixBotIcon({ className, ...props }: OnixBotIconProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("size-full", className)}
      {...props}
    >
      {/* Background Circle - Blue */}
      <circle cx="50" cy="50" r="50" className="fill-blue-600" />
      
      {/* Robot Head - White */}
      <path
        d="M25 45 C 25 30, 75 30, 75 45 L 75 65 C 75 80, 25 80, 25 65 Z"
        className="fill-white"
      />
      
      {/* Ears/Headphones */}
      <circle cx="20" cy="55" r="8" className="fill-white" />
      <circle cx="80" cy="55" r="8" className="fill-white" />
      
      {/* Antenna */}
      <line x1="50" y1="30" x2="50" y2="20" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="18" r="4" className="fill-white" />
      
      {/* Eyes - Blue */}
      <ellipse cx="40" cy="55" rx="3" ry="5" className="fill-blue-600" />
      <ellipse cx="60" cy="55" rx="3" ry="5" className="fill-blue-600" />
      
      {/* Chat Bubble Tail (Subtle) */}
      <path d="M50 82 L 45 90 L 60 81 Z" className="fill-white" /> 
    </svg>
  );
}
