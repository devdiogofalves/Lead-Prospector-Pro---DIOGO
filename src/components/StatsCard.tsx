import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  variant?: 'default' | 'primary' | 'accent' | 'warning';
  delay?: number;
}

export function StatsCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  variant = 'default',
  delay = 0
}: StatsCardProps) {
  const variantStyles = {
    default: 'border-border/50',
    primary: 'border-primary/30 glow-primary',
    accent: 'border-accent/30 glow-accent',
    warning: 'border-warning/30',
  };

  const iconStyles = {
    default: 'bg-secondary text-muted-foreground',
    primary: 'bg-primary/20 text-primary',
    accent: 'bg-accent/20 text-accent',
    warning: 'bg-warning/20 text-warning',
  };

  return (
    <div 
      className={cn(
        "glass rounded-xl p-6 animate-slide-up",
        variantStyles[variant]
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 text-xs font-medium",
              trend.positive ? "text-success" : "text-destructive"
            )}>
              <span>{trend.positive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}% vs. semana anterior</span>
            </div>
          )}
        </div>
        <div className={cn(
          "p-3 rounded-lg",
          iconStyles[variant]
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
