# Tree Monitor · Płock

System ewidencji i pielęgnacji zieleni miejskiej dla Urzędu Miasta Płocka (hackathon „Code the Future”).

- `server/` — REST API (Node.js + Express + TypeScript, lokalna baza SQLite przez `node:sqlite`)
- `client/` — aplikacja webowa (React + Vite + TypeScript + TailwindCSS + react-leaflet, mapy wyłącznie z Geoportalu GUGiK)
- `database/` — `init.sql` (schemat + dane testowe) i `species_dictionary.csv` (100 gatunków)

Pełna specyfikacja i zasady pracy: [`agents.md`](./agents.md).

## Uruchomienie

Wymagany Node.js **22.13+**.

```bash
npm run setup     # instaluje zależności (root, server, client)
npm run dev       # API na http://localhost:4000, aplikacja na http://localhost:5173
```

Baza `database/tree-monitor.db` tworzy się automatycznie przy pierwszym starcie serwera.
Reset bazy do danych testowych: `npm run db:reset`.

## Konta testowe

| Konto | Rola | Widok |
|-------|------|-------|
| Anna Kowalska | Urzędnik | Desktop |
| Piotr Nowak | Urzędnik | Desktop (demo MUTEX w drugiej karcie) |
| Jan Zieliński | Wykonawca | Symulator tabletu |
