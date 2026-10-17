import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-emerald-100 text-emerald-800',
        secondary: 'bg-slate-100 text-slate-700',
        outline: 'border border-slate-300 text-slate-700',
        destructive: 'bg-red-100 text-red-800',
        warning: 'bg-amber-100 text-amber-800',
        info: 'bg-blue-100 text-blue-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
