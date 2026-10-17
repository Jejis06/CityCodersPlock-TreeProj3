# Tree Monitor · Płock

System ewidencji, monitorowania i kontroli nasadzeń drzew, krzewów i bylin dla **Urzędu Miasta Płocka**.

Projekt powstał na hackathonie **„Code the Future” / Hackathon Płock** (Projekt 3 — Tree Monitor) jako odpowiedź na brief miasta: centralna ewidencja zieleni, interaktywna mapa GIS, dziennik pielęgnacji, weryfikacja prac wykonawców, raporty i eksporty.

---

## Spis treści

1. [O projekcie](#o-projekcie)
2. [Stack technologiczny](#stack-technologiczny)
3. [Wymagania](#wymagania)
4. [Uruchomienie](#uruchomienie)
5. [Konta testowe](#konta-testowe)
6. [Widoki aplikacji](#widoki-aplikacji)
7. [Dane i źródła](#dane-i-źródła)
8. [Funkcje (mapowanie na brief)](#funkcje-mapowanie-na-brief)
9. [Struktura repozytorium](#struktura-repozytorium)
10. [Skrypty npm](#skrypty-npm)
11. [Dokumentacja techniczna](#dokumentacja-techniczna)

---

## O projekcie

**Tree Monitor** to lokalna aplikacja webowa (monorepo) do pełnego cyklu życia nasadzeń miejskich:

- od rejestracji rośliny na mapie (kod ewidencyjny, gatunek, działka, decyzja administracyjna),
- przez zlecanie i realizację prac pielęgnacyjnych / wycinki / nasadzania,
- po zatwierdzanie przez urzędnika, alerty gwarancyjne (3 lata) i eksport raportów.

Aplikacja działa **bez chmury i Dockera**: jeden plik SQLite, API Node.js i frontend React. Idealne do dema na laptopie lub iPadzie w tej samej sieci Wi‑Fi.

| Rola | Urządzenie | Zakres |
|------|------------|--------|
| **Urzędnik** | Desktop | Pełny dostęp: mapa, filtry, karta ewidencyjna, zlecenia, kolejka zatwierdzeń (MUTEX), lista/analizy/eksporty |
| **Wykonawca** | Tablet (symulator lub prawdziwy iPad) | Tylko własne zadania; bez umów i finansowania |

---

## Stack technologiczny

| Warstwa | Technologie |
|---------|-------------|
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS 4, react-router 8, Radix UI (Dialog/Sheet), lucide-react |
| **Mapa** | Leaflet 1.9 + react-leaflet 5 · **wyłącznie Geoportal GUGiK** (WMS: BaseMap, Ortofotomapa, KIEG, KIUT) · lokalny podkład CAD/DXF |
| **Backend** | Node.js ≥ 22.13, Express 5, TypeScript, `cors`, `multer` |
| **Baza** | SQLite (jeden plik) przez wbudowany **`node:sqlite`** (`DatabaseSync`) — bez ORM, bez Prisma, bez better-sqlite3 |
| **Geokodowanie** | GUGiK ULDK (działki) + UUG (adresy) |
| **Eksporty** | PDF (`jspdf`), Excel/OOXML (`fflate`), DXF (ASCII R12), Shapefile (.zip), wycinek mapy WMS→PDF |
| **Auth** | Semi-mock: wybór konta + nagłówek `x-user-id` (bez haseł) |

Szczegółowy opis architektury i przepływów danych: [`DOCSPEC.md`](./DOCSPEC.md).

---

## Wymagania

- **Node.js 22.13+** (wymagane przez `node:sqlite`)
- npm (wchodzi w skład Node)
- Opcjonalnie: `sqlite3` CLI — tylko jeśli chcesz ręcznie odtworzyć bazę z SQL

Sprawdzenie wersji:

```bash
node -v   # powinno być v22.13.x lub nowsze
```

---

## Uruchomienie

### 1. Instalacja zależności

Z katalogu głównego repozytorium:

```bash
npm run setup
```

Instaluje pakiety w root, `/server` i `/client`.

### 2. Start w trybie deweloperskim

```bash
npm run dev
```

| Usługa | Adres |
|--------|-------|
| Frontend (Vite) | http://localhost:5173 |
| REST API | http://localhost:4000 |
| Healthcheck | http://localhost:4000/api/health |

Przy pierwszym starcie serwer tworzy `database/tree-monitor.db` z `database/init.sql`, a gdy roślin jest mało (&lt; 40) — doładowuje punkty BDOT10k Płocka.

### 3. Reset bazy (dane demo)

```bash
npm run db:reset
```

Kasuje i odtwarza schemat + seed + poprawki demo (m.in. usunięcie wybranych punktów, wymuszenie statusu zielonego dla wybranych kodów).

### 4. Konfiguracja (opcjonalna)

Skopiuj przykłady env, jeśli chcesz zmienić port lub CORS:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

| Plik | Zmienne |
|------|---------|
| `server/.env` | `PORT=4000`, `CORS_ORIGIN=http://localhost:5173`, `DB_PATH=../database/tree-monitor.db` |
| `client/.env` | `VITE_API_URL=` (puste = proxy Vite `/api` i `/uploads` → `:4000`) |

### 5. Demo na iPadzie (ta sama sieć)

1. Uruchom `npm run dev` na laptopie (Vite nasłuchuje w sieci lokalnej).
2. Na iPadzie otwórz `http://<IP_LAPTOPA>:5173/ipad`.
3. Widok automatycznie loguje wykonawcę **Jan Zieliński** (tryb PWA / pełny ekran, bez zmiany konta).

Możesz też dodać stronę do ekranu początkowego iPada (`manifest.json` → `start_url: /ipad`).

---

## Konta testowe

Brak logowania hasłem. Na ekranie `/` wybierasz jedno z trzech kont. Sesja jest w **`sessionStorage`** (każda karta przeglądarki = osobny użytkownik → demo MUTEX na dwóch urzędnikach).

| Konto | UUID | Rola | Widok |
|-------|------|------|-------|
| **Anna Kowalska** | `11111111-1111-1111-1111-111111111111` | Urzędnik | Desktop — pełny dostęp |
| **Piotr Nowak** | `22222222-2222-2222-2222-222222222222` | Urzędnik | Desktop — druga karta do demo blokady MUTEX |
| **Jan Zieliński** | `33333333-3333-3333-3333-333333333333` | Wykonawca | Symulator tabletu / `/ipad` |

Każde zapytanie do API (poza `/api/health` i `/api/users`) wysyła nagłówek:

```http
x-user-id: <uuid>
```

**Bezpieczeństwo ról:** wykonawca **nigdy** nie otrzymuje pól `contract_number`, `contract_scan_url`, `funding_source` (sanitaryzacja na serwerze — także w DevTools → Network).

---

## Widoki aplikacji

| Ścieżka | Kto | Opis |
|---------|-----|------|
| `/` | wszyscy | Wybór konta |
| `/official` | urzędnik | Interaktywna mapa Geoportalu + filtry + dodawanie roślin + karta ewidencyjna |
| `/official/list` | urzędnik | Lista, analizy (wykres gatunków), eksporty (PDF/XLSX/DXF/SHP), wycinek mapy do PDF |
| `/official/queue` | urzędnik | Kolejka zatwierdzeń prac + MUTEX (blokada 5 min) |
| `/contractor` | wykonawca | Symulator tabletu: tablica zadań + mapa robocza |
| `/ipad` | wykonawca | Standalone na prawdziwym iPadzie (auto-login) |

### Kolory statusów roślin na mapie

| Status | Kolor | Znaczenie |
|--------|-------|-----------|
| `green` | zielony | zdrowe / prace zatwierdzone |
| `yellow` | żółty/pomarańczowy | w trakcie prac / czeka na zatwierdzenie |
| `red` | czerwony | przeznaczone do wycinki |
| `blue` | niebieski | do posadzenia / nowe nasadzenie |

Kody ewidencyjne: **`D{n}/{rok}`** (drzewo), **`K{n}/{rok}`** (krzew/bylina).

---

## Dane i źródła

| Źródło | Zawartość |
|--------|-----------|
| `database/init.sql` | Schemat SQLite + seed startowy + 100 gatunków |
| `database/species_dictionary.csv` | Słownik 100 gatunków (PL / łacina / odmiana) — źródło prawdy |
| `database/plock_bdot10k_trees.kml` | ~65 rzeczywistych punktów drzew BDOT10k (Płock, TERYT 1462) |
| `database/plock_bdot10k_geocoded.json` | Cache geokodowania ULDK/UUG dla seedera |
| `client/public/demo/` | Zdjęcia SVG realizacji, skany umów PDF, przykładowy DXF Starego Rynku |

Po pełnym seedzie typowa baza demo zawiera ok. **70+ roślin**, **~40 zadań**, **3 użytkowników**, **100 gatunków**.

Warstwy mapy (GUGiK — **bez OpenStreetMap**):

- Geoportal — Mapa Uliczna (BaseMap)
- Geoportal — Ortofotomapa HD
- KIEG — działki i budynki
- KIUT — uzbrojenie terenu (woda, gaz, prąd, …)
- Lokalny podkład CAD / raster (projekt Starego Rynku)

---

## Funkcje (mapowanie na brief)

Brief hackathonu (Adobe Scan / Polecenie — Projekt 3) → implementacja:

| Wymaganie briefu | Realizacja |
|------------------|------------|
| Interaktywna mapa z ortofotomapą i warstwami GIS | Leaflet + WMS GUGiK (BaseMap, ORTO, KIEG, KIUT) |
| Punkty z numerem ewidencyjnym / rok | Kody `D n/rok`, `K n/rok`; etykiety na markerach |
| Własne podkłady DXF / raster / WMS | Parser DXF/GeoJSON/raster + warstwy Geoportalu |
| Karta ewidencyjna (lokalizacja, działka, gatunek, umowa, finansowanie, decyzje, zdjęcia) | `TreeCardSheet` + historia zadań |
| Dziennik pielęgnacji (podlewanie, nawożenie, cięcia, …) | Zadania: kategorie `pielegnacja` / `wycinka` / `nasadzanie` |
| Weryfikacja i akceptacja prac urzędnika | Kolejka + approve / reject z powodem |
| System uprawnień Urząd vs wykonawca | Role `official` / `contractor` + sanitizer API |
| Równoczesna praca wielu użytkowników | Live polling; MUTEX na zatwierdzeniach |
| Operacje zbiorcze na grupie drzew | Tryby zaznaczania + `POST /api/tasks/bulk` |
| Monitowanie terminów (kolor na mapie) | Statusy kolorów + alerty decyzji 3-letnich |
| Wyszukiwanie i filtrowanie | Filtry mapy i listy: kod, adres, gatunek, rok, status, wykonawca, decyzja |
| Zestawienia tabelaryczne i raporty | Widok listy + wykres gatunków |
| Praca w terenie (tablet) | Symulator + `/ipad` PWA |
| Eksport PDF, DXF, XLSX, Shapefile | Panel eksportu + wycinek mapy do PDF |
| Centralne narzędzie cyklu życia nasadzeń | Od dodania → zlecenie → realizacja → zatwierdzenie → gwarancja |

---

## Struktura repozytorium

```
├── client/                 # React + Vite (UI)
│   ├── public/demo/        # Zdjęcia, umowy PDF, CAD demo
│   └── src/
│       ├── app/            # Routing, auth context, layouty
│       ├── components/     # UI współdzielony (Button, Sheet, PlantBadge, …)
│       ├── features/
│       │   ├── map/        # TreeMap, Geoportal, filtry, CAD, KIUT
│       │   ├── tree-card/  # Karta ewidencyjna, zlecenia, gwarancje
│       │   ├── approval-queue/
│       │   ├── contractor/ # Tablet + iPad
│       │   └── export-and-list/
│       ├── hooks/
│       ├── lib/            # api.ts, utils
│       └── types/
├── server/                 # Express REST API
│   └── src/
│       ├── routes/         # users, species, trees, tasks, geocode, uploads
│       ├── lib/            # db, sanitize, treeCode, constants
│       ├── middleware/     # currentUser, requireRole
│       └── seeds/          # BDOT10k + poprawki demo
├── database/
│   ├── init.sql
│   ├── species_dictionary.csv
│   ├── plock_bdot10k_trees.kml
│   └── tree-monitor.db     # lokalny plik (w .gitignore)
├── agents.md / .cursorrules  # Specyfikacja dla agentów AI
├── DOCSPEC.md              # Architektura i flow danych
└── README.md               # Ten plik
```

---

## Skrypty npm

| Komenda | Opis |
|---------|------|
| `npm run setup` | Instalacja zależności (root + server + client) |
| `npm run dev` | Serwer `:4000` + klient `:5173` jednocześnie |
| `npm run build` | Build TypeScript serwera + Vite klienta |
| `npm run typecheck` | `tsc --noEmit` w obu pakietach |
| `npm run db:reset` | Reset SQLite do stanu demo |

---

## Dokumentacja techniczna

- **[`DOCSPEC.md`](./DOCSPEC.md)** — stack (streszczenie), architektura, model danych, przepływy biznesowe, kontrakt API, integracje GIS
- **[`agents.md`](./agents.md)** — pełna specyfikacja domenowa (źródło prawdy dla rozwoju; kopia w `.cursorrules`)

---

## Licencja / kontekst

Hackathon „Code the Future” — Płock. System demonstracyjny dla Urzędu Miasta Płocka (ewidencja zieleni miejskiej).
