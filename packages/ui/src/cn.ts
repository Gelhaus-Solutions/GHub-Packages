import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** clsx plus tailwind-merge, the same helper every app in the house uses. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
