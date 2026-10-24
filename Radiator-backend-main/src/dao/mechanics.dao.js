// Mechanic names for the bonus pages (filters and the review picker): the Settings list plus every name already on the
// tenant's own bills, so a mechanic removed from Settings who still has bills and bonus can still be reviewed and paid.
// Each vertical keeps its bills in its own collection; engineering tenants use their own /engbills/mechanics route.
import { getAllmechanics } from "./radiator.dao.js";
import { getAllAutoMechanics } from "./autobill.dao.js";
import { getAllTyreMechanics } from "./tyrebill.dao.js";

export async function listMechanicNames(clientId, businessType) {
  if (businessType === "tyre") return getAllTyreMechanics(clientId);
  if (businessType === "automobile") return getAllAutoMechanics(clientId);
  return getAllmechanics(clientId);
}
