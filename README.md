# Local Football Tournament Auction Platform

A production-quality web application for conducting live, IPL-style local football player auctions.

## Architecture Overview

```
React (Vite + TS + Tailwind)
       ↓ (HTTP / REST)
ASP.NET Core 10 Web API
       ↓ (EF Core)
PostgreSQL 16 (Authoritative Store)
       ↓ (Real-time Broadcasts)
ASP.NET Core SignalR → React Clients (Auctioneer & Live Projector)
```

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/)
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker & Docker Compose](https://www.docker.com/)

---

## Getting Started Locally

### 1. Start PostgreSQL Database
```bash
docker compose up -d
```
This spins up PostgreSQL on port `5432` with database `tournament_auction`.

### 2. Run the Backend API
```bash
dotnet build backend/TournamentAuction.slnx
cd backend/TournamentAuction.Api
dotnet run --no-build
```
- API Base URL: `http://localhost:5050`
- Swagger UI: `http://localhost:5050/swagger`
- Health Check: `http://localhost:5050/health`
- SignalR Auction Hub: `http://localhost:5050/hubs/auction`

### 3. Run Backend Unit Tests
```bash
cd backend/TournamentAuction.Tests
dotnet test --no-build
```

### 4. Run the Frontend Client
```bash
cd frontend
npm install
npm run dev -- --port 5174
```
- Frontend UI: `http://localhost:5174`

---

Build before starting the API when changing backend code. On Windows, the running API locks `TournamentApp.Api.dll`; keep `--no-build` when testing while the API is running.

## Live Auction and Projector

Open the auctioneer at `/tournaments/{id}/auction` and use its **Projector** link to open `/tournaments/{id}/projector`. The public `/live/{slug}` route requires no login when public live viewing is enabled. Recorded bids, players, results, purses, and squads update through SignalR. Fullscreen and reconnect recovery are supported.

See [Milestone 7 implementation and verification](docs/Milestone7.md). Run `npm run test:realtime` from `frontend` with the local API, Vite, and Chrome available to verify synchronization in separate browser windows.

## Specification Reference & Milestones

See `docs/ImplementationPLAN.txt` for the full master specification.

- **Milestone 0**: Project Foundation & Runtimes (Completed)
- **Milestone 1**: Authentication & Tournament Management (Completed)
- **Milestone 2**: Tournament Configuration & Teams (Completed)
- **Milestone 3**: Sets & Players (with CSV Preview Import) (Completed)
- **Milestone 4**: Preflight Validation Checklist (Completed)
- **Milestone 5**: Backend Auction Engine (Transactions, Reserves, Lots) (Completed)
- **Milestone 6**: Auctioneer Console UI (Completed)
- **Milestone 7**: SignalR Real-Time Sync & Projector Screen (`/live/:slug`) (Completed)
- **Milestone 8**: Unsold Rounds & Controlled Corrections Audit
- **Milestone 9**: Statistics & Auction Wrapped Experience
- **Milestone 10**: Media Handling, Exports & Final Polish
