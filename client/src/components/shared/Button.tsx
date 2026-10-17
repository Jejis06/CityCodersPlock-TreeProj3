import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        outline: 'border border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
        ghost: 'text-slate-700 hover:bg-slate-100',
        destructive: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
        link: 'text-emerald-700 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        default: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        touch: 'h-16 px-8 text-lg [&_svg]:size-6',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
