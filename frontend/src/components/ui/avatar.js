import React from 'react';

// Generate a consistent color based on a string
const stringToColor = (str) => {
  if (!str) return '#94a3b8'; // Default gray
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    '#3b82f6', // blue
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#f59e0b', // amber
    '#10b981', // green
    '#06b6d4', // cyan
    '#f43f5e', // rose
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#a855f7', // violet
  ];
  
  return colors[Math.abs(hash) % colors.length];
};

// Extract initials from name
const getInitials = (name) => {
  if (!name) return '?';
  
  const parts = name.trim().split(' ').filter(Boolean);
  
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  
  // Get first letter of first and last name
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export const Avatar = ({ name, size = 'md', className = '' }) => {
  const initials = getInitials(name);
  const bgColor = stringToColor(name);
  
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };
  
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center text-white font-semibold ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {initials}
    </div>
  );
};

export default Avatar;
