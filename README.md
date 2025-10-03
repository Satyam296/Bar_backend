# Barbershop Backend

This is the backend for the Barbershop project.

## How to run

1. Install dependencies:

```powershell
npm install
```

2. Build TypeScript and run:

```powershell
npm run build
npm start
```

The server listens on port 3001 by default and exposes the API under `/api/v1/`.

## Notes
- Ensure a `.env` with necessary variables (like `JWT_SECRET_KEY` and `Shop_Password`) is present for production.
- CORS is currently enabled globally (`app.use(cors())`) — you may want to lock it to your frontend origin.

Remote repo: https://github.com/Satyam296/Bar_backend.git
