import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function formatDate(date: string) {
  return format(parseISO(date), "d 'de' MMMM, yyyy", { locale: es });
}

export function formatShortDate(date: string) {
  return format(parseISO(date), "d MMM", { locale: es });
}

export function formatAmount(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    maximumFractionDigits: 2,
  }).format(amount);
}
