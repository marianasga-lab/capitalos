/**
 * Se ejecuta al arrancar el servidor. Vercel usa UTC: sin esto, a las 6 pm
 * de México la app ya creería que es el día siguiente.
 */
export function register() {
  process.env.TZ ||= "America/Mexico_City";
}
