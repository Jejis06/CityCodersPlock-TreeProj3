import { PLANT_TYPE_LABELS } from '@/types/domain';
import { INVENTORY_COLUMNS, type CellValue, type NumberFormat } from './exportColumns';
import type { ExportContext } from './exportTypes';
import { buildZip } from './zip';

/**
 * Hand-written SpreadsheetML (Office Open XML) workbook:
 *   Arkusz 1 "Ewidencja Roślin"        — filtered inventory with autofilter and frozen header,
 *   Arkusz 2 "Wykres Gatunków OX-OY"   — species/count table + native Excel bar chart (OX species, OY count).
 * Sheet names cannot contain "/", hence "OX-OY".
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const INVENTORY_SHEET_NAME = 'Ewidencja Roślin';
export const SPECIES_SHEET_NAME = 'Wykres Gatunków OX-OY';

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/** Cell style ids, matching `cellXfs` in STYLES_XML. */
const STYLE = { normal: 0, header: 1, title: 2, degrees: 3, meters: 4, integer: 5, bold: 6, subtitle: 7 } as const;
const NUMBER_STYLE: Record<NumberFormat, number> = {
  integer: STYLE.integer,
  degrees: STYLE.degrees,
  meters: STYLE.meters,
};

const STYLES_XML = `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.000000"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="14"/><color rgb="FF065F46"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF047857"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF94A3B8"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const escapeXml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

const cellRef = (col: number, row: number) => `${columnLetter(col)}${row}`;

function cellXml(col: number, row: number, value: CellValue, style: number = STYLE.normal): string {
  if (value === null || value === '') return '';
  const ref = cellRef(col, row);
  const s = style ? ` s="${style}"` : '';
  if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

const rowXml = (row: number, cells: string[], height?: number) =>
  `<row r="${row}"${height ? ` ht="${height}" customHeight="1"` : ''}>${cells.join('')}</row>`;

const colsXml = (widths: number[]) =>
  `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;

const sheetRef = (name: string) => `'${name.replace(/'/g, "''")}'`;

function inventorySheet(ctx: ExportContext): string {
  const header = rowXml(
    1,
    INVENTORY_COLUMNS.map((column, i) => cellXml(i, 1, column.header, STYLE.header)),
    30,
  );
  const rows = ctx.trees.map((tree, r) =>
    rowXml(
      r + 2,
      INVENTORY_COLUMNS.map((column, c) =>
        cellXml(c, r + 2, column.value(tree), column.numberFormat ? NUMBER_STYLE[column.numberFormat] : STYLE.normal),
      ),
    ),
  );
  const lastRef = cellRef(INVENTORY_COLUMNS.length - 1, Math.max(ctx.trees.length + 1, 1));
  return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<dimension ref="A1:${lastRef}"/>
<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${colsXml(INVENTORY_COLUMNS.map((c) => c.width))}
<sheetData>${header}${rows.join('')}</sheetData>
<autoFilter ref="A1:${lastRef}"/>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

/** Row where the species table starts (header) on sheet 2; data starts one row below. */
const SPECIES_HEADER_ROW = 4;

function speciesSheet(ctx: ExportContext, withChart: boolean): string {
  const total = ctx.species.reduce((sum, s) => sum + s.count, 0);
  const firstData = SPECIES_HEADER_ROW + 1;
  const rows = [
    rowXml(1, [cellXml(0, 1, 'Zestawienie gatunków — OX: gatunek, OY: ilość wystąpień', STYLE.title)], 22),
    rowXml(2, [
      cellXml(
        0,
        2,
        `Urząd Miasta Płocka · ewidencja zieleni · wygenerowano ${ctx.generatedAt.toLocaleString('pl-PL')}` +
          (ctx.filtersSummary.length ? ` · filtry: ${ctx.filtersSummary.join('; ')}` : ''),
        STYLE.subtitle,
      ),
    ]),
    rowXml(
      SPECIES_HEADER_ROW,
      ['Gatunek (oś OX)', 'Nazwa łacińska', 'Typ', 'Ilość wystąpień (oś OY)'].map((h, i) =>
        cellXml(i, SPECIES_HEADER_ROW, h, STYLE.header),
      ),
      30,
    ),
    ...ctx.species.map((s, i) =>
      rowXml(firstData + i, [
        cellXml(0, firstData + i, s.label),
        cellXml(1, firstData + i, s.latinName),
        cellXml(2, firstData + i, PLANT_TYPE_LABELS[s.type]),
        cellXml(3, firstData + i, s.count, STYLE.integer),
      ]),
    ),
  ];
  const totalRow = firstData + ctx.species.length;
  rows.push(
    rowXml(totalRow, [
      cellXml(0, totalRow, 'Razem', STYLE.bold),
      cellXml(1, totalRow, `${ctx.species.length} gatunków`, STYLE.bold),
      cellXml(2, totalRow, '', STYLE.bold),
      cellXml(3, totalRow, total, STYLE.bold),
    ]),
  );

  return `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<dimension ref="A1:D${totalRow}"/>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${colsXml([32, 30, 16, 22])}
<sheetData>${rows.join('')}</sheetData>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
${withChart ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

function drawingXml(speciesCount: number): string {
  const toCol = 4 + Math.min(Math.max(speciesCount, 6), 18);
  return `${XML_HEADER}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>26</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro="">
<xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Wykres gatunków"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${NS_REL}" r:id="rId1"/></a:graphicData></a:graphic>
</xdr:graphicFrame>
<xdr:clientData/>
</xdr:twoCellAnchor>
</xdr:wsDr>`;
}

const richText = (text: string, rotate = false) =>
  `<c:tx><c:rich><a:bodyPr${rotate ? ' rot="-5400000" vert="horz"' : ''}/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="pl-PL" sz="1100" b="1"/><a:t>${escapeXml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/>`;

function chartXml(ctx: ExportContext): string {
  const sheet = sheetRef(SPECIES_SHEET_NAME);
  const first = SPECIES_HEADER_ROW + 1;
  const last = SPECIES_HEADER_ROW + ctx.species.length;
  const n = ctx.species.length;
  const catPoints = ctx.species.map((s, i) => `<c:pt idx="${i}"><c:v>${escapeXml(s.label)}</c:v></c:pt>`).join('');
  const valPoints = ctx.species.map((s, i) => `<c:pt idx="${i}"><c:v>${s.count}</c:v></c:pt>`).join('');
  const dataPoints = ctx.species
    .map((s, i) =>
      s.type === 'shrub'
        ? `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="7C3AED"/></a:solidFill></c:spPr></c:dPt>`
        : '',
    )
    .join('');

  return `${XML_HEADER}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_REL}">
<c:roundedCorners val="0"/>
<c:chart>
<c:title>${richText('Liczba wystąpień gatunków (OX: gatunek, OY: ilość)')}</c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>
<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:tx><c:strRef><c:f>${sheet}!$D$${SPECIES_HEADER_ROW}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Ilość wystąpień (oś OY)</c:v></c:pt></c:strCache></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="047857"/></a:solidFill></c:spPr>
<c:invertIfNegative val="0"/>
${dataPoints}
<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>
<c:cat><c:strRef><c:f>${sheet}!$A$${first}:$A$${last}</c:f><c:strCache><c:ptCount val="${n}"/>${catPoints}</c:strCache></c:strRef></c:cat>
<c:val><c:numRef><c:f>${sheet}!$D$${first}:$D$${last}</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="${n}"/>${valPoints}</c:numCache></c:numRef></c:val>
</c:ser>
<c:gapWidth val="60"/>
<c:axId val="50010001"/><c:axId val="50010002"/>
</c:barChart>
<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>
<c:title>${richText('OX: Gatunek')}</c:title>
<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>
<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
<c:title>${richText('OY: Ilość wystąpień', true)}</c:title>
<c:numFmt formatCode="0" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>
<c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="1"/></c:valAx>
</c:plotArea>
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
</c:chartSpace>`;
}

function workbookXml(rowCount: number): string {
  const filterRange = `$A$1:$${columnLetter(INVENTORY_COLUMNS.length - 1)}$${Math.max(rowCount + 1, 1)}`;
  return `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">
<bookViews><workbookView activeTab="0"/></bookViews>
<sheets>
<sheet name="${escapeXml(INVENTORY_SHEET_NAME)}" sheetId="1" r:id="rId1"/>
<sheet name="${escapeXml(SPECIES_SHEET_NAME)}" sheetId="2" r:id="rId2"/>
</sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${escapeXml(sheetRef(INVENTORY_SHEET_NAME))}!${filterRange}</definedName></definedNames>
</workbook>`;
}

function contentTypesXml(withChart: boolean): string {
  const override = (part: string, type: string) => `<Override PartName="${part}" ContentType="${type}"/>`;
  const ooxml = 'application/vnd.openxmlformats-officedocument';
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${override('/xl/workbook.xml', `${ooxml}.spreadsheetml.sheet.main+xml`)}
${override('/xl/worksheets/sheet1.xml', `${ooxml}.spreadsheetml.worksheet+xml`)}
${override('/xl/worksheets/sheet2.xml', `${ooxml}.spreadsheetml.worksheet+xml`)}
${override('/xl/styles.xml', `${ooxml}.spreadsheetml.styles+xml`)}
${withChart ? override('/xl/drawings/drawing1.xml', `${ooxml}.drawing+xml`) : ''}
${withChart ? override('/xl/charts/chart1.xml', `${ooxml}.drawingml.chart+xml`) : ''}
${override('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml')}
</Types>`;
}

const CORE_PROPERTIES_REL = `${NS_PKG_REL}/metadata/core-properties`;

/** `type` is a short officeDocument relationship name ("worksheet") or a full relationship URI. */
const relsXml = (rels: { id: string; type: string; target: string }[]) =>
  `${XML_HEADER}<Relationships xmlns="${NS_PKG_REL}">${rels
    .map((r) => {
      const type = r.type.startsWith('http') ? r.type : `${NS_REL}/${r.type}`;
      return `<Relationship Id="${r.id}" Type="${type}" Target="${r.target}"/>`;
    })
    .join('')}</Relationships>`;

function corePropsXml(ctx: ExportContext): string {
  const iso = ctx.generatedAt.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Ewidencja zieleni — Urząd Miasta Płocka</dc:title>
<dc:creator>${escapeXml(ctx.generatedBy ?? 'TREE MONITOR Płock')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>
</cp:coreProperties>`;
}

export function buildXlsx(ctx: ExportContext): Blob {
  const withChart = ctx.species.length > 0;
  const entries: Record<string, string> = {
    '[Content_Types].xml': contentTypesXml(withChart),
    '_rels/.rels': relsXml([
      { id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' },
      { id: 'rId2', type: CORE_PROPERTIES_REL, target: 'docProps/core.xml' },
    ]),
    'docProps/core.xml': corePropsXml(ctx),
    'xl/workbook.xml': workbookXml(ctx.trees.length),
    'xl/_rels/workbook.xml.rels': relsXml([
      { id: 'rId1', type: 'worksheet', target: 'worksheets/sheet1.xml' },
      { id: 'rId2', type: 'worksheet', target: 'worksheets/sheet2.xml' },
      { id: 'rId3', type: 'styles', target: 'styles.xml' },
    ]),
    'xl/styles.xml': STYLES_XML,
    'xl/worksheets/sheet1.xml': inventorySheet(ctx),
    'xl/worksheets/sheet2.xml': speciesSheet(ctx, withChart),
  };
  if (withChart) {
    entries['xl/worksheets/_rels/sheet2.xml.rels'] = relsXml([
      { id: 'rId1', type: 'drawing', target: '../drawings/drawing1.xml' },
    ]);
    entries['xl/drawings/drawing1.xml'] = drawingXml(ctx.species.length);
    entries['xl/drawings/_rels/drawing1.xml.rels'] = relsXml([
      { id: 'rId1', type: 'chart', target: '../charts/chart1.xml' },
    ]);
    entries['xl/charts/chart1.xml'] = chartXml(ctx);
  }
  return buildZip(entries, XLSX_MIME);
}
