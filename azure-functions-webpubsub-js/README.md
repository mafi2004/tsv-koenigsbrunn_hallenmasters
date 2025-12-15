# Azure Functions (JavaScript) · Azure Web PubSub – Funino Live Updates

Diese Functions liefern zwei Endpunkte:
- `GET /api/negotiate` – erzeugt eine **Client-Verbindungs-URL** für Azure Web PubSub.
- `POST /api/publish` – sendet eine **Spielplan-Payload** live an die Gruppe `schedule`.

## Voraussetzungen
- **Azure Web PubSub** Instanz (Hub: `funino`).
- **Azure Functions Core Tools v4** + **Node 18+**.
- **Web PubSub Extensions** für Functions installieren:

```bash
func extensions install --package Microsoft.Azure.WebJobs.Extensions.WebPubSub --version 1.0.0
```

> Siehe Microsoft Learn Quickstart/Tutorials zu Web PubSub + Functions. 

## Lokaler Start
```bash
npm install
copy local.settings.example.json local.settings.json
# optional: AzureWebJobsStorage für echtes Storage anpassen
func start
```

## Deployment (Azure)
1. Function App (Linux, Node v4) bereitstellen.
2. **App Settings** setzen:
   - `WebPubSubConnectionString` (aus Web PubSub → Keys)
3. CORS für eure Domain erlauben.
4. Deploy: `func azure functionapp publish <APP_NAME>`

## Endpunkte
- **Negotiate**: `GET /api/negotiate?userId=viewer-123`
  - Antwort: `{ url, accessToken, ... }` (von Binding geliefert)
- **Publish**: `POST /api/publish` mit JSON `{ title, generatedAt, matches: [...] }`
  - Antwort: `{ ok: true }`

## Sicherheit
- **Function-Key** für `/api/publish` verwenden: `?code=...` (Function-Level Key).
- Keine Secrets im Frontend; nur Functions rufen.

## Schema der Payload (vereinfachte Validierung in publish)
```json
{
  "title": "Turniername",
  "generatedAt": "2025-12-14T16:45:00.000Z",
  "matches": [
    {"start":"10:00","end":"10:12","group":"A","round":1,"field":"Feld 1","team1":"A1","team2":"A2"}
  ]
}
```

## Hinweis
Die Bindings für Azure Web PubSub (\`webPubSubConnection\`, \`webPubSub\`) werden durch die oben installierte Extension bereitgestellt.
