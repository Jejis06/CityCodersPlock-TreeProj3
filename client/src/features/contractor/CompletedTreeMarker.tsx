import './contractor-map.css';
import L from 'leaflet';
import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import { speciesLabel, type TreeListItem } from '@/types/domain';

const iconCache = new Map<string, L.DivIcon>();

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function getCompletedIcon(tree: TreeListItem, selected: boolean): L.DivIcon {
  const key = `${tree.code}|${tree.type}|${selected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const classes = [
      'tree-marker',
      'tree-marker--completed',
      `tree-marker--${tree.type}`,
      selected ? 'tree-marker--selected' : '',
    ].join(' ');
    icon = L.divIcon({
      className: 'tree-marker-icon',
      html: `<div class="${classes}"><span class="tree-marker__dot"><span class="tree-marker__check">✓</span></span><span class="tree-marker__label">${escapeHtml(tree.code)}</span></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

interface CompletedTreeMarkerProps {
  tree: TreeListItem;
  selected?: boolean;
  onClick?: (tree: TreeListItem) => void;
}

/** Marker rośliny z wykonanym zadaniem: kolor niezależny od statusu rośliny. Renderowany jako dziecko TreeMap. */
export function CompletedTreeMarker({ tree, selected = false, onClick }: CompletedTreeMarkerProps) {
  const eventHandlers = useMemo(() => ({ click: () => onClick?.(tree) }), [onClick, tree]);

  return (
    <Marker
      position={[tree.latitude, tree.longitude]}
      icon={getCompletedIcon(tree, selected)}
      eventHandlers={eventHandlers}
      zIndexOffset={selected ? 1000 : 0}
      riseOnHover
    >
      <Tooltip direction="top" offset={[0, -14]}>
        <strong>{speciesLabel(tree.species_polish_name, tree.species_cultivar)}</strong>
        <br />
        Praca wykonana / w weryfikacji
      </Tooltip>
    </Marker>
  );
}
