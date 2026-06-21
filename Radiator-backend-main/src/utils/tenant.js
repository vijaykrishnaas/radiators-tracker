import { ObjectId } from "mongodb";

// Multi-tenant safety helpers. Every business query MUST be scoped by clientId,
// sourced only from req.user.clientId (the JWT) — never from request input.

// Throws loudly if a clientId is missing, turning a silent cross-tenant data
// leak into an immediate, obvious failure.
export function assertClientId(clientId) {
  if (!clientId) {
    throw new Error("Missing clientId — refusing to run an unscoped tenant query");
  }
  return clientId;
}

// Normalises a clientId (string from a JWT, or an ObjectId) to an ObjectId for
// use in Mongo filters and documents.
export function toClientId(clientId) {
  assertClientId(clientId);
  return clientId instanceof ObjectId ? clientId : new ObjectId(clientId);
}
