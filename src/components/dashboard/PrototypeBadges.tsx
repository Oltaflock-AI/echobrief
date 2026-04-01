import { Bot, Chrome, Globe } from 'lucide-react';
import { T, statusColors, withOpacity } from '@/lib/theme';

// ─── Badge Base Component ───
interface BadgeProps {
  children: React.ReactNode;
  color: string;
  bg: string;
}

export function Badge({ children, color, bg }: BadgeProps) {
  return (
    <span 
      className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide"
      style={{ 
        padding: '3px 10px', 
        borderRadius: 100, 
        fontSize: 11, 
        color, 
        background: bg,
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </span>
  );
}

// ─── Status Badge ───
type MeetingStatus = 'completed' | 'processing' | 'recording' | 'failed' | 'scheduled';

interface StatusBadgeProps {
  status: MeetingStatus | string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = statusColors[status as MeetingStatus] || statusColors.completed;
  
  return (
    <Badge color={s.color} bg={s.bg}>
      {status === 'recording' && (
        <span 
          className="animate-pulse"
          style={{ 
            width: 6, 
            height: 6, 
            borderRadius: '50%', 
            background: T.green,
          }} 
        />
      )}
      {s.label}
    </Badge>
  );
}

// ─── Source Badge (Bot vs Extension) ───
interface SourceBadgeProps {
  source: 'Bot' | 'Extension' | string;
}

export function SourceBadge({ source }: SourceBadgeProps) {
  const isBot = source === 'Bot';
  const color = isBot ? T.purple : T.orangeL;
  const bg = isBot ? withOpacity(T.purple, 0.12) : withOpacity(T.orange, 0.1);
  
  return (
    <Badge color={color} bg={bg}>
      {isBot ? <Bot size={11} /> : <Chrome size={11} />}
      {source}
    </Badge>
  );
}

// ─── Language Badge ───
interface LanguageBadgeProps {
  language: string;
}

export function LanguageBadge({ language }: LanguageBadgeProps) {
  return (
    <Badge color={T.textS} bg="rgba(168, 168, 168, 0.1)">
      <Globe size={11} /> {language}
    </Badge>
  );
}

// ─── Gradient Bar Accent ───
export function GradientBar() {
  return (
    <div 
      style={{ 
        height: 3, 
        background: T.gradient, 
        borderRadius: 2, 
        marginBottom: 16 
      }} 
    />
  );
}

// ─── Card Component with Hover ───
interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, className = '', onClick, hover, style }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`transition-all duration-200 ${hover ? 'cursor-pointer hover:-translate-y-0.5' : ''} ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 16,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
