# Backend Integration Examples

This directory contains examples showing how to integrate the sync engine with different backend systems.

## Query Parameters Expected by Backend

When implementing your backend sync endpoints, expect these query parameters:

### Pull Endpoint (`GET /sync/pull`)
- `since` (number, optional): Timestamp to get changes since. If not provided, returns all documents.
- `limit` (number, optional): Maximum number of changes to return. Default: 100.
- `offset` (number, optional): Pagination offset for large datasets. Default: 0.

Example: `GET /sync/pull?since=1634567890123&limit=50&offset=0`

### Push Endpoint (`POST /sync/push`)
- No query parameters expected
- Request body contains the change batch JSON

### Health Check (`GET /health`)
- No query parameters expected
- Should return 200 OK with connection status

## Response Formats

### Pull Response
```json
{
  "success": true,
  "changes": [
    {
      "id": "doc-1",
      "operation": "create",
      "data": { "name": "John", "email": "john@example.com" },
      "version": { "id": "doc-1", "timestamp": 1634567890123 },
      "localTimestamp": 1634567890123
    }
  ],
  "timestamp": 1634567890123
}
```

### Push Response
```json
{
  "success": true,
  "conflicts": [],
  "timestamp": 1634567890123
}
```

### Error Response
```json
{
  "success": false,
  "error": "Database connection failed",
  "timestamp": 1634567890123
}
```