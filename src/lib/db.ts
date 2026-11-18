// Hora de México para "hoy", cortes de tarjeta y meses (el servidor puede estar en UTC).
process.env.TZ ||= "America/Mexico_City";

import { PrismaClient } from "@prisma/client";

// Reutiliza una sola instancia en desarrollo (hot reload de Next crea módulos nuevos).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
