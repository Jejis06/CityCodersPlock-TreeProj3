import L from 'leaflet';
import { Marker, Tooltip } from 'react-leaflet';
import { speciesLabel, TREE_STATUS_META, type TreeListItem } from '@/types/domain';
import { useTreeMarkerHandlers } from './useTreeMarkerHandlers';

const iconCache = new Map<string, L.DivIcon>();

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function getTreeIcon(tree: TreeListItem, selected: boolean, multiSelected: boolean): L.DivIcon {
  const key = `${tree.code}|${tree.status}|${tree.type}|${selected}|${multiSelected}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const classes = [
      'tree-marker',
      `tree-marker--${tree.status}`,
      `tree-marker--${tree.type}`,
      selected ? 'tree-marker--selected' : '',
      multiSelected ? 'tree-marker--multi-selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    icon = L.divIcon({
      className: 'tree-marker-icon',
      html: `<div class="${classes}"><span class="tree-marker__dot"></span><span class="tree-marker__label">${escapeHtml(tree.code)}</span></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

interface TreeMarkerProps {
  tree: TreeListItem;
  selected?: boolean;
  multiSelected?: boolean;
  onClick?: (tree: TreeListItem) => void;
}

export function TreeMarker({ tree, selected = false, multiSelected = false, onClick }: TreeMarkerProps) {
  const eventHandlers = useTreeMarkerHandlers(tree, onClick);

  return (
    <Marker
      position={[tree.latitude, tree.longitude]}
      icon={getTreeIcon(tree, selected, multiSelected)}
      eventHandlers={eventHandlers}
      zIndexOffset={selected ? 1000 : multiSelected ? 900 : 0}
      riseOnHover
    >
      <Tooltip direction="top" offset={[0, -14]}>
        <strong>{speciesLabel(tree.species_polish_name, tree.species_cultivar)}</strong>
        <br />
        {TREE_STATUS_META[tree.status].label}
      </Tooltip>
    </Marker>
  );
}
