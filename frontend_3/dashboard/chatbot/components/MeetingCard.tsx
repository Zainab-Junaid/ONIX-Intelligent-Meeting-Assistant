"use client"

import React from 'react';
import { Calendar, Clock, Users } from 'lucide-react';

interface MeetingCardProps {
  meeting: {
    id: string;
    title: string;
    date: string;
    time: string;
    participants?: string[];
  };
  onSelect: (meeting: any) => void;
  isSelected: boolean;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({ meeting, onSelect, isSelected }) => {
  return (
    <button
      onClick={() => onSelect(meeting)}
      className={`w-full px-4 py-3 text-left transition-all duration-150 border-b border-gray-100 last:border-b-0 ${
        isSelected
          ? 'bg-gradient-to-r from-blue-100 to-indigo-100'
          : 'hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50'
      }`}
    >
      <div className="font-semibold text-gray-900 mb-1.5 text-sm">
        {meeting.title}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Calendar size={11} />
          {meeting.date}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {meeting.time}
        </span>
        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
          <Users size={11} />
          {meeting.participants?.length || 0}
        </span>
      </div>
    </button>
  );
};






