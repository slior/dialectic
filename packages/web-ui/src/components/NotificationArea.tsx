'use client'

import { useEffect, useRef } from 'react';
import { NotificationMessage } from '@/lib/types';

interface NotificationAreaProps {
  notifications: NotificationMessage[];
  onDismiss: (id: string) => void;
}

const typeStyles: Record<NotificationMessage['type'], { bg: string; text: string; icon: string }> = {
  info: { bg: 'bg-accent-blue/10', text: 'text-accent-blue', icon: 'ℹ' },
  success: { bg: 'bg-accent-green/10', text: 'text-accent-green', icon: '✓' },
  warning: { bg: 'bg-accent-yellow/10', text: 'text-accent-yellow', icon: '⚠' },
  error: { bg: 'bg-accent-red/10', text: 'text-accent-red', icon: '✕' },
};

export default function NotificationArea({ notifications, onDismiss }: NotificationAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new notifications arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [notifications]);

  // Auto-dismiss after 10 seconds (except errors)
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    notifications.forEach((notification) => {
      if (notification.type !== 'error') {
        const timer = setTimeout(() => {
          onDismiss(notification.id);
        }, 10000);
        timers.push(timer);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [notifications, onDismiss]);

  if (notifications.length === 0) return null;

  // Show only the last 5 notifications
  const recentNotifications = notifications.slice(-5);

  return (
    <div 
      ref={containerRef}
      className="bg-secondary border-t border-b border-border px-4 py-2 max-h-32 overflow-y-auto"
    >
      <div className="space-y-1">
        {recentNotifications.map((notification) => {
          const style = typeStyles[notification.type];
          return (
            <div
              key={notification.id}
              className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${style.bg}`}
            >
              <span className={style.text}>{style.icon}</span>
              <span className="text-text-secondary flex-1">{notification.message}</span>
              <span className="text-text-muted text-xs">
                {notification.timestamp.toLocaleTimeString()}
              </span>
              <button
                onClick={() => onDismiss(notification.id)}
                className="text-text-muted hover:text-text-primary ml-2"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

