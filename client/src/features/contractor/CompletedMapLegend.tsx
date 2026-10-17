import './contractor-map.css';
import { CheckCircle2 } from 'lucide-react';

/** Legenda mapy w tabie "Wykonane / W weryfikacji" (zastępuje legendę statusów). */
export function CompletedMapLegend() {
  return (
    <div className="absolute bottom-8 left-3 z-[1001] flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <span className="tree-marker tree-marker--completed tree-marker--tree size-5! cursor-default!">
        <span className="tree-marker__dot border-2!">
          <span className="tree-marker__check">✓</span>
        </span>
      </span>
      <span className="leading-tight">
        <span className="flex items-center gap-1 font-semibold text-slate-800">
          <CheckCircle2 className="size-3.5 text-[#2f7f86]" /> Praca zgłoszona
        </span>
        <span className="text-slate-500">w weryfikacji lub zatwierdzona</span>
      </span>
    </div>
  );
}
