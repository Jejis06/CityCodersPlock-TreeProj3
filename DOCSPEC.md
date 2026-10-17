# Tree Monitor · Docspec

Dokumentacja techniczna: stack, architektura, model danych, przepływy i integracje.

Powiązane: [`README.md`](./README.md) (uruchomienie), [`agents.md`](./agents.md) (pełna specyfikacja domenowa).

---

## 0. Stack technologiczny (streszczenie)

| Obszar | Wybór | Uwagi |
|--------|-------|-------|
| **Runtime** | Node.js ≥ 22.13 | Wymagany przez wbudowany `node:sqlite` |
| **API** | Express 5 + TypeScript (`tsx` w dev) | REST pod prefiksem `/api` |
| **Baza** | SQLite (plik `database/tree-monitor.db`) | Sterownik `node:sqlite` (`DatabaseSync`), WAL, STRICT tables, bez ORM |
| **Frontend** | React 19 + Vite 8 + TypeScript | SPA, alias `@/` → `src/` |
| **Styling** | Tailwind CSS 4 + CVA + Radix UI | Komponenty w stylu shadcn/ui |
| **Routing** | react-router 8 | `/`, `/official/*`, `/contractor`, `/ipad` |
| **Mapa** | Leaflet 1.9 + react-leaflet 5 | **Tylko WMS GUGiK** — zakaz OpenStreetMap |
| **GIS zewnętrzne** | Geoportal WMS, ULDK, UUG | Działki, adresy, ortofoto, KIEG, KIUT |
| **Upload** | multer → `server/uploads/` | Zdjęcia / skany umów |
| **Eksport** | jspdf, fflate (XLSX), DXF ASCII, Shapefile | Generowane w przeglądarce |
| **CAD lokalny** | dxf-parser | DXF / GeoJSON / raster w ramce Starego Rynku |
| **Auth** | Semi-mock (`x-user-id`) | 3 konta w `sessionStorage` |
| **Realtime** | Polling HTTP | ~2–3,5 s (bez WebSocket) |
| **PWA (iPad)** | `manifest.json` + meta Apple | `/ipad` standalone |

**Czego świadomie nie używamy:** Docker, chmura DB, Prisma/ORM, better-sqlite3, OpenStreetMap, logowanie hasłem, WebSocket.

---

## 1. Cel systemu

Aplikacja służy do:

1. **Ewidencji** roślin (drzewa, krzewy/byliny) na mapie Płocka z kodem `D{n}/{rok}` / `K{n}/{rok}`.
2. **Monitorowania statusu** wizualnego (kolor markera) i terminów (m.in. gwarancja 3-letnia z decyzji).
3. **Zlecania i kontroli prac** wykonawcy (pielęgnacja, wycinka, nasadzanie) z zatwierdzaniem przez urzędnika.
4. **Raportowania i eksportu** (PDF, XLSX, DXF, Shapefile, wycinek mapy).

Odpowiada na pain points z briefu miasta: rozproszone dane, trudna kontrola wykonawców, czasochłonne zestawienia.

---

## 2. Architektura wysokopoziomowa

```
┌─────────────────────────────────────────────────────────────────┐
│  Przeglądarka / iPad                                            │
│  React SPA (Vite)                                               │
│    • OfficialMapPage / TreeCard / Queue / List+Export           │
│    • ContractorPage / IpadStandaloneApp                         │
│    • TreeMap (Leaflet) ← WMS GUGiK + CAD lokalny                │
│    • api.ts → fetch + nagłówek x-user-id                        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (dev: proxy /api, /uploads)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Express API (:4000)                                            │
│    middleware: currentUser → requireRole                        │
│    routes: users, species, trees, tasks, geocode, uploads       │
│    lib: db, sanitizeForRole, treeCode, withTransaction          │
│    seeds: BDOT10k enricher, databaseFixes                       │
└──────────────┬──────────────────────────┬───────────────────────┘
               │                          │
               ▼                          ▼
     ┌─────────────────┐        ┌──────────────────────┐
     │ SQLite lokalny  │        │ GUGiK (HTTP)         │
     │ tree-monitor.db │        │ ULDK · UUG · WMS*    │
     └─────────────────┘        └──────────────────────┘
                                         * WMS też bezpośrednio
                                           z przeglądarki (Leaflet)
```

### Zasady twarde

1. **Klient nigdy nie dotyka bazy** — tylko REST.
2. **Logika biznesowa i uprawnienia żyją na serwerze** (statusy drzew, MUTEX, sanitizacja).
3. **Jedno połączenie SQLite na proces** (`server/src/lib/db.ts`).
4. **Zapytania wyłącznie parametryzowane** (`:id` — bez sklejania SQL).
5. **Mapa = wyłącznie Geoportal GUGiK** (+ lokalny CAD).

### Monorepo

| Katalog | Odpowiedzialność |
|---------|------------------|
| `/client` | UI, mapa, eksporty przeglądarkowe |
| `/server` | REST, reguły, SQLite, upload, seedery |
| `/database` | Schema SQL, CSV gatunków, KML BDOT10k, plik `.db` |

---

## 3. Warstwy aplikacji (Feature-Sliced)

### Frontend (`client/src/features/`)

| Moduł | Rola |
|-------|------|
| `map/` | `TreeMap`, warstwy WMS, markery, filtry, CAD, KIUT, zaznaczanie grupowe |
| `tree-card/` | Karta ewidencyjna, zlecenie zadania, edycja lokalizacji, gwarancje 3 lat, bulk drawer |
| `approval-queue/` | Kolejka `pending_approval`, lock/unlock, approve/reject |
| `contractor/` | Tablica zadań, mapa izolowana per tab, dialog realizacji, `/ipad` |
| `export-and-list/` | Tabela, wykres gatunków, generatory eksportu, wycinek mapy PDF |

Współdzielone: `components/shared/`, `lib/api.ts`, `hooks/useRealtimePolling.ts`, `types/domain.ts`.

### Backend (`server/src/`)

| Ścieżka | Rola |
|---------|------|
| `routes/*.ts` | Endpointy domenowe |
| `middleware/currentUser.ts` | `x-user-id` → `req.user` |
| `middleware/requireRole.ts` | Guard `official` / `contractor` |
| `lib/db.ts` | SQLite, `queryAll` / `queryOne` / `execute`, `withTransaction` |
| `lib/sanitize.ts` | Usuwanie pól wrażliwych dla `contractor` |
| `lib/treeCode.ts` | Generowanie `D{n}/{rok}`, `K{n}/{rok}` |
| `seeds/` | Import BDOT10k + trwałe poprawki demo |

---

## 4. Model danych

### Diagram relacji

```
users 1───* trees (contractor_id, created_by)
users 1───* tasks (assigned_to, created_by, reviewed_by, locked_by)
species_dictionary 1───* trees
trees 1───* tasks   (ON DELETE CASCADE)
```

### Tabele

#### `users`
Semi-mock konta: `id` (UUID TEXT), `full_name`, `role` (`official` | `contractor`), `device` (`desktop` | `tablet`).

#### `species_dictionary`
100 rekordów z CSV: `type` (`tree` | `shrub`), `polish_name`, `latin_name`, `cultivar`.

#### `trees`
Ewidencja punktu na mapie:

| Pole | Opis |
|------|------|
| `code` | Unikalny `D{n}/{rok}` lub `K{n}/{rok}` |
| `latitude` / `longitude` | WGS84 |
| `address`, `plot_number`, `parcel_geometry` | Adres, działka, obrys GeoJSON (ULDK) |
| `planting_year` | Nullable („Nieznany”) |
| `is_from_decision`, `decision_number` | Nasadzenie z decyzji (gwarancja 3 lata) |
| `status` | `green` \| `yellow` \| `red` \| `blue` |
| `contract_number`*, `contract_scan_url`*, `funding_source`* | **Wrażliwe** — tylko urzędnik |

\* Usuwane przez `sanitizeForRole` dla wykonawcy.

#### `tasks`
Zlecenie pracy + MUTEX:

| Pole | Opis |
|------|------|
| `category` / `subcategory` | Zob. poniżej |
| `status` | `assigned` → `pending_approval` → `approved` \| `rejected` |
| `contractor_photo_url`, `contractor_comment`, `completed_at` | Realizacja |
| `official_rejection_reason`, `reviewed_by`, `reviewed_at` | Decyzja urzędu |
| `locked_by`, `locked_at` | MUTEX (timeout 5 min) |
| `contract_number`*, `contract_scan_url`* | Wrażliwe |

### Kategorie zadań

| Kategoria | Podkategorie |
|-----------|--------------|
| `pielegnacja` | `nawozenie`, `podlewanie`, `przycinanie` |
| `wycinka` | `wycinka` |
| `nasadzanie` | `posadzenie`, `korowanie`, `palikowanie` |

### Reguła kolorów rośliny (serwer)

| Zdarzenie | `trees.status` |
|-----------|----------------|
| Zlecenie `wycinka` | `red` |
| Zlecenie `pielegnacja` | `yellow` |
| Zlecenie `nasadzanie` | `blue` |
| Submit wykonawcy (`pending_approval`) | `yellow` |
| Approve | `green` |
| Reject | kolor wg kategorii (jak przy zleceniu) |
| Nowa roślina z mapy | `green` lub `blue` (do posadzenia) |

---

## 5. Przepływy danych (end-to-end)

### 5.1. Wybór roli i sesja

```
GET /api/users  (bez auth)
  → lista 3 kont
  → login() zapisuje user w React Context + sessionStorage
  → każde kolejne api.* dokłada header x-user-id
```

### 5.2. Mapa urzędnika — odczyt

```
OfficialMapPage
  → useTrees(filters, { live: true })
  → GET /api/trees?species_id&planting_year&status&contractor_id&task_category&address
  → sanitizeForRole (official: pełne dane)
  → TreeMap + TreeMarker (kolor = status)
  → polling co 3,5 s (reconcileById — bez resetu zoomu/UI)
```

Wyszukiwanie kodu/adresu:

```
AddressAutocomplete
  → GET /api/geocode/suggest?q=
  → plant | trees | gugik
  → filtr address + flyTo (zoom 20 dla rośliny)
```

### 5.3. Dodanie rośliny

```
Tryb „Dodaj roślinę” → klik mapy
  → GET /api/geocode/reverse?lat&lng   (ULDK + UUG)
  → GET /api/species?q=                (słownik)
  → GET /api/trees/next-code?type=     (podgląd)
  → POST /api/trees                    (kod nadaje serwer w transakcji)
      opcjonalnie: status blue → INSERT task nasadzanie/posadzenie
  → nowy marker na mapie (polling / reload)
```

### 5.4. Zlecenie zadania (pojedyncze)

```
TreeCardSheet → TaskCreatorForm
  → POST /api/trees/:id/tasks
      { category, subcategory, contract_number, … }
  → assigned_to = contractor drzewa lub domyślny Jan Zieliński
  → UPDATE trees.status wg kategorii
  → wykonawca widzi zadanie ≤ 2 s (polling contractor)
```

### 5.5. Zlecenie zbiorcze

```
CursorModeToolbar: multi_point | spatial_box
  → selectedTreeIds
  → BulkSelectionDrawer
  → POST /api/tasks/bulk { tree_ids, category, subcategory, … }
  → transakcja: N× INSERT tasks + UPDATE statusów
```

### 5.6. Realizacja u wykonawcy

```
ContractorPage (tab „Do wykonania”)
  → GET /api/tasks + GET /api/trees  (poll 2 s)
  → izolacja: tylko assigned_to === currentUser
  → mapa tylko roślin z aktywnego taba
  → CompleteTaskDialog
      upload: POST /api/uploads → { url }
      lub demo: /demo/photos/*.svg
  → POST /api/tasks/:id/submit { photo_url, comment? }
  → status pending_approval, trees.status = yellow
  → kolejka urzędnika
```

Pola umów/finansowania **nie występują** w odpowiedzi API dla `contractor`.

### 5.7. Zatwierdzenie (MUTEX)

```
Urzędnik A: klik w zadanie
  → POST /api/tasks/:id/lock
      atomowe UPDATE … WHERE locked_by IS NULL
        OR locked_by = :userId
        OR locked_at < now−5min
      RETURNING → OK | 409 Conflict (locked_by_name)

Urzędnik B (inna karta): widzi kłódkę, przyciski disabled
  (polling kolejki 3,5 s)

Zatwierdź:
  → POST /api/tasks/:id/approve
  → status approved, clear lock, trees.status = green

Odrzuć:
  → POST /api/tasks/:id/reject { reason }
  → status rejected, reason dla wykonawcy, status drzewa wg kategorii

Zamknięcie bez decyzji:
  → POST /api/tasks/:id/unlock
```

### 5.8. Alerty gwarancji 3-letniej

```
MapFilterBar → „Alerty Decyzji (3 lata)”
  → DecisionWarrantyModal
  → drzewa is_from_decision z terminem ≤ ~31 dni
  → POST /api/trees/warranty-tasks
  → pakiet zadań pielegnacja/przycinanie + status yellow
```

### 5.9. Lista i eksporty

```
/official/list
  → GET /api/trees + GET /api/tasks (client-side filters)
  → tabela, wykres SVG gatunków
  → ExportPanel → Blob w przeglądarce:
       XLSX | DXF | Shapefile.zip | PDF raport | PDF wycinek mapy
  → MapAreaPdfSelector: BBOX → WMS GetMap (canvas) → PDF
```

Układy współrzędnych w eksportach: WGS84, PL-2000 strefa 7 (EPSG:2178), PUWG 1992 (EPSG:2180) — `client/src/features/export-and-list/lib/geodesy.ts`.

### 5.10. Seed i start serwera

```
index.ts
  1. jeśli brak schematu → exec init.sql
  2. jeśli COUNT(trees) < 40 → seedBdot10k() z KML
  3. applyDatabaseFixes() (idempotentne korekty demo)
  4. listen(PORT)
```

---

## 6. Kontrakt API (skrót)

Prefiks: `/api`. Błędy: `{ "error": "…" }`. Auth: `x-user-id` (wyjątki: `health`, `users`).

| Metoda | Ścieżka | Rola | Opis |
|--------|---------|------|------|
| GET | `/health` | — | Healthcheck |
| GET | `/users` | — | 3 konta |
| GET | `/species?q=&type=` | any | Słownik gatunków |
| GET | `/geocode/reverse?lat=&lng=` | official | Działka + adres |
| GET | `/geocode/suggest?q=` | official | Podpowiedzi kod/ulica/GUGiK |
| GET | `/trees` | any | Lista (filtry query) |
| GET | `/trees/next-code?type=` | official | Podgląd kodu |
| GET | `/trees/:id` | any | Karta + historia tasks |
| POST | `/trees` | official | Nowa roślina |
| PATCH | `/trees/:id` | official | Edycja |
| DELETE | `/trees/:id` | official | Usunięcie (+ CASCADE tasks) |
| POST | `/trees/:id/tasks` | official | Zlecenie |
| POST | `/trees/warranty-tasks` | official | Pakiet gwarancyjny |
| POST | `/trees/seed-bdot10k` | official | Import BDOT10k |
| POST | `/trees/recalculate-locations` | official | Przeliczenie adresów/działek |
| GET | `/tasks?status=` | any | Lista (contractor: tylko własne) |
| POST | `/tasks/bulk` | official | Masowe zlecenie |
| POST | `/tasks/:id/submit` | contractor | Zgłoszenie wykonania |
| POST | `/tasks/:id/lock` | official | MUTEX |
| POST | `/tasks/:id/unlock` | official | Zwolnienie blokady |
| POST | `/tasks/:id/approve` | official | Zatwierdzenie |
| POST | `/tasks/:id/reject` | official | Odrzucenie `{ reason }` |
| POST | `/uploads` | any | Multipart `file` → `{ url }` |

Pełna semantyka: `agents.md` §5.

---

## 7. Warstwa GIS

### Podkłady i nakładki (Leaflet `LayersControl`)

| Warstwa | Typ | Usługa |
|---------|-----|--------|
| Mapa Uliczna GUGiK BaseMap | base (domyślna) | WMS BaseMap `layers=osm` |
| Ortofotomapa HD | base | WMS ORTO StandardResolution |
| Działki i budynki (KIEG) | overlay (on) | Krajowa Integracja Ewidencji Gruntów |
| Uzbrojenie (KIUT) | overlay (off) | wodociąg, gaz, prąd, … |
| CAD lokalny | overlay | DXF/raster Stary Rynek |

- Środek mapy: Płock `[52.5463, 19.6885]`, zoom 17, `maxZoom` 21.
- ORTO bywa niestabilne (losowe 404) → retry kafli w `GeoportalWms` / `MapLayers` (do 10 prób).
- Konfiguracja: `client/src/features/map/mapConfig.ts`.

### Geokodowanie (serwer)

- **ULDK** `GetParcelByXY` → numer działki, obręb, geometria.
- **UUG** `GetAddressReverse` / `GetAddress` → adres i podpowiedzi.

---

## 8. Bezpieczeństwo i uprawnienia

| Mechanizm | Opis |
|-----------|------|
| Semi-mock auth | Brak haseł; `x-user-id` musi istnieć w `users` |
| `requireRole('official')` | 403 dla wykonawcy |
| `sanitizeForRole` | Rekurencyjne usuwanie pól wrażliwych |
| Izolacja zadań | Contractor: SQL `assigned_to = req.user.id` + filtr UI |
| MUTEX | Atomowy UPDATE z timeoutem 5 min — bez race SELECT+UPDATE |
| SQL injection | Wyłącznie named parameters |
| Sesja per karta | `sessionStorage` (demo równoległych urzędników) |

---

## 9. Synchronizacja „na żywo”

Brak WebSocket — **HTTP polling**:

| Widok | Interwał | Endpointy |
|-------|----------|-----------|
| Mapa urzędnika, karta drzewa, kolejka, lista | 3,5 s | `useRealtimePolling` |
| Wykonawca (laptop + iPad) | 2 s | `useContractorLiveTasks` |

Zasady: brak nakładających się requestów, pauza przy ukrytej karcie, merge stanu bez resetu formularzy/zoomu (`reconcileById`, porównanie JSON).

---

## 10. Dane demo i źródła zewnętrzne

| Artefakt | Rola |
|----------|------|
| `database/init.sql` | Schema + seed bazowy |
| `species_dictionary.csv` | 100 gatunków |
| `plock_bdot10k_trees.kml` | Punkty BDOT10k (Płock) |
| Seeder `bdot10kEnricher.ts` | Gatunki, statusy, umowy, zadania — deterministyczny PRNG |
| `databaseFixes.ts` | Trwałe usunięcia / wymuszenie green |
| `client/public/demo/` | Zdjęcia, PDF umów, DXF |

Integracje runtime (sieć):

- WMS Geoportal (przeglądarka)
- ULDK / UUG GUGiK (serwer Node)

---

## 11. Eksporty — przepływ danych

```
ExportContext { trees, species, generatedAt, generatedBy, filtersSummary }
  → generator (lazy import)
  → Blob
  → saveFileWithPicker() | <a download>
```

| Format | Lokalizacja generatora | Uwagi |
|--------|------------------------|-------|
| `.xlsx` | `formats/xlsx.ts` | OOXML + wykres gatunków |
| `.dxf` | `formats/dxf.ts` | R12, warstwy DRZEWA/KRZEWY, PL-2000/7 |
| Shapefile `.zip` | `formats/shapefile.ts` | SHP+SHX+DBF+PRJ (PUWG 1992) |
| Raport `.pdf` | `formats/pdfReport.ts` | DejaVu Sans (PL), autotable |
| Wycinek `.pdf` | `formats/mapAreaPdf.ts` | WMS GetMap + markery na canvas |

`.dwg` nie jest generowane (format zamknięty Autodesk) — w UI wskazówka: otwórz DXF → „Zapisz jako DWG”.

---

## 12. Środowiska i porty

| Zmienna | Domyślnie | Znaczenie |
|---------|-----------|-----------|
| `PORT` | `4000` | API |
| `CORS_ORIGIN` | `http://localhost:5173` | CORS |
| `DB_PATH` | `../database/tree-monitor.db` | Plik SQLite |
| `VITE_API_URL` | puste | Base URL API; w dev proxy Vite |

Dev proxy (Vite): `/api` i `/uploads` → `http://localhost:4000`.

---

## 13. Mapowanie briefu (PDF) → architektura

Brief „Projekt 3 — TREE MONITOR” (Hackathon Płock) wymaga m.in.:

- mapy z ortofotomapą i WMS → **moduł `features/map` + GUGiK**,
- kart ewidencyjnych → **`tree-card`**,
- dziennika pielęgnacji i akceptacji → **`tasks` + `approval-queue` + `contractor`**,
- uprawnień Urząd/wykonawca → **role + sanitize**,
- pracy równoczesnej → **polling + MUTEX**,
- operacji zbiorczych → **bulk selection + `/tasks/bulk`**,
- alertów terminów → **statusy kolorów + DecisionWarrantyModal**,
- filtrów i zestawień → **mapa + `/official/list`**,
- pracy terenowej → **`/contractor` + `/ipad`**,
- eksportów PDF/DXF/XLSX/SHP → **`export-and-list`**.

Ten Docspec opisuje, jak powyższe wymagania są zrealizowane w kodzie monorepo Tree Monitor.

---

*Ostatnia aktualizacja dokumentacji: zgodnie ze stanem repozytorium po implementacji MVP hackathonu (mapa GIS, karta drzewa, MUTEX, wykonawca/iPad, lista i eksporty, seed BDOT10k).*
