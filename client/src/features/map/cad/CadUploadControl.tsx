import { FileUp, RotateCcw } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Feedback';
import { CAD_ACCEPT } from './parseCadFile';
import type { CadLayerState } from './useCadLayer';

export function CadUploadControl({ cad }: { cad: CadLayerState }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentName = cad.data.source === 'demo' ? 'Projekt demo: Stary Rynek (ZZ-01.dxf)' : cad.data.fileName;

  return (
    <div className="absolute bottom-8 right-3 z-[1001] w-72 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Podkład CAD / raster (lokalny)</p>
      <p className="mt-1 truncate text-sm font-medium text-slate-800" title={currentName}>
        {currentName}
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => inputRef.current?.click()} disabled={cad.loading}>
          {cad.loading ? <Spinner className="size-4 text-white" /> : <FileUp />}
          Wgraj z dysku
        </Button>
        {cad.data.source !== 'demo' && (
          <Button size="sm" variant="outline" onClick={cad.resetToDemo} title="Przywróć projekt demo">
            <RotateCcw />
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">DXF, GeoJSON, PNG/JPG — przetwarzane tylko w przeglądarce.</p>
      {cad.error && <p className="mt-1.5 text-xs font-medium text-red-700">{cad.error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={CAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void cad.loadFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
