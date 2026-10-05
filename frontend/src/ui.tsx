import React from 'react';

// --- BUTTON ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const base = 'inline-flex items-center justify-center font-bold uppercase tracking-wider brutal-border transition-all cursor-pointer select-none';
  
  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 brutal-shadow-sm',
    md: 'text-sm px-4 py-2 gap-2 brutal-shadow',
    lg: 'text-base px-6 py-3 gap-2.5 brutal-shadow-lg font-black',
  }[size];

  const variantStyles = {
    primary: 'bg-amber-400 hover:bg-amber-300 text-zinc-950 active:translate-x-0.5 active:translate-y-0.5',
    secondary: 'bg-white hover:bg-amber-50 text-zinc-950 active:translate-x-0.5 active:translate-y-0.5',
    accent: 'bg-cyan-400 hover:bg-cyan-300 text-zinc-950 active:translate-x-0.5 active:translate-y-0.5',
    danger: 'bg-rose-500 hover:bg-rose-400 text-white active:translate-x-0.5 active:translate-y-0.5',
    ghost: 'bg-transparent hover:bg-zinc-200 text-zinc-900 border-zinc-400 shadow-none',
  }[variant];

  const disabledStyle = disabled
    ? 'opacity-50 cursor-not-allowed transform-none hover:bg-inherit pointer-events-none'
    : '';

  return (
    <button
      className={`${base} ${sizeStyles} ${variantStyles} ${disabledStyle} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
};

// --- BADGE ---
interface BadgeProps {
  color?: 'yellow' | 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'zinc';
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  color = 'yellow',
  children,
  className = '',
}) => {
  const colorMap = {
    yellow: 'bg-amber-300 text-zinc-950',
    green: 'bg-emerald-300 text-zinc-950',
    blue: 'bg-cyan-300 text-zinc-950',
    orange: 'bg-orange-400 text-zinc-950',
    red: 'bg-rose-400 text-zinc-950',
    purple: 'bg-purple-300 text-zinc-950',
    zinc: 'bg-zinc-200 text-zinc-800',
  }[color];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-mono font-bold brutal-border-sm uppercase ${colorMap} ${className}`}
    >
      {children}
    </span>
  );
};

// --- CARD ---
interface CardProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  subtitle,
  badge,
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white brutal-border brutal-shadow p-5 ${className}`}>
      {(title || badge) && (
        <div className="flex items-start justify-between gap-3 mb-3 border-b-2 border-zinc-900 pb-2.5">
          <div>
            {title && <h3 className="font-extrabold text-lg tracking-tight uppercase">{title}</h3>}
            {subtitle && <p className="text-xs text-zinc-600 font-mono mt-0.5">{subtitle}</p>}
          </div>
          {badge}
        </div>
      )}
      {children}
    </div>
  );
};

// --- STAT ---
interface StatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  subtext?: string;
  className?: string;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  unit,
  subtext,
  className = '',
}) => {
  return (
    <div className={`bg-[#fdfaf3] brutal-border p-3 brutal-shadow-sm ${className}`}>
      <span className="text-[11px] font-mono uppercase font-bold text-zinc-600 block mb-0.5">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-mono font-black text-zinc-950">{value}</span>
        {unit && <span className="text-xs font-mono text-zinc-600">{unit}</span>}
      </div>
      {subtext && <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">{subtext}</span>}
    </div>
  );
};

// --- PANEL ---
interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  icon,
  badge,
  collapsed = false,
  onToggle,
  children,
  className = '',
}) => {
  return (
    <div className={`bg-white/95 backdrop-blur-md brutal-border brutal-shadow-sm mb-3.5 overflow-hidden ${className}`}>
      <div
        onClick={onToggle}
        className="flex items-center justify-between px-3.5 py-2.5 bg-amber-200/80 brutal-border-sm border-t-0 border-l-0 border-r-0 cursor-pointer select-none hover:bg-amber-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-extrabold text-xs uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <span className="font-mono text-xs font-black">{collapsed ? '+' : '−'}</span>
        </div>
      </div>
      {!collapsed && <div className="p-3.5 space-y-3">{children}</div>}
    </div>
  );
};

// --- SLIDER ---
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  unit?: string;
  formatValue?: (val: number) => string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
  formatValue,
  disabled = false,
}) => {
  const displayVal = formatValue ? formatValue(value) : `${value}${unit ? ' ' + unit : ''}`;

  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-center text-xs font-mono">
        <span className="font-bold uppercase text-zinc-700">{label}</span>
        <span className="font-bold px-1.5 py-0.5 bg-zinc-100 brutal-border-sm text-zinc-950">
          {displayVal}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-zinc-200 rounded-none appearance-none cursor-pointer accent-amber-500 brutal-border-sm"
      />
    </div>
  );
};

// --- TOGGLE ---
interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <label className={`flex items-center justify-between cursor-pointer select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <span className="text-xs font-bold font-mono uppercase text-zinc-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 px-0.5 flex items-center brutal-border-sm transition-colors ${
          checked ? 'bg-amber-400' : 'bg-zinc-200'
        }`}
      >
        <span
          className={`w-4 h-4 bg-zinc-950 brutal-border-sm transform transition-transform ${
            checked ? 'translate-x-5 bg-zinc-950' : 'translate-x-0 bg-white'
          }`}
        />
      </button>
    </label>
  );
};

// --- SEGMENTED CONTROL ---
interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (val: T) => void;
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div className={`grid grid-cols-${options.length} gap-1 p-1 bg-zinc-200 brutal-border-sm ${className}`}>
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={opt.disabled}
            onClick={() => onChange(opt.id)}
            className={`flex items-center justify-center gap-1.5 py-1 px-2 text-xs font-mono font-bold uppercase transition-all ${
              active
                ? 'bg-amber-400 text-zinc-950 brutal-border-sm brutal-shadow-sm'
                : 'bg-white/80 hover:bg-white text-zinc-700'
            } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
