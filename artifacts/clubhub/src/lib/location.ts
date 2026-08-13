/** Short display name for a saved location: "Aranda District Playing Fields,
 * Aranda, District of Belconnen, ACT, 2614" → "Aranda District Playing Fields".
 * The full address is still stored so maps links stay accurate. */
export function locationName(location: string) {
  return location.split(",")[0].trim() || location;
}

/** Google Maps search link for the full stored address. */
export function mapsUrl(location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
