import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

export function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const ORDER_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-blue-100 text-blue-800',
  delivering: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  approved: 'bg-green-200 text-green-900',
  rejected: 'bg-red-100 text-red-800',
};

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  assigned: 'Assigned',
  delivering: 'Delivering',
  delivered: 'Delivered',
  approved: 'Approved',
  rejected: 'Rejected',
};

/**
 * Cleans and validates image URLs, particularly for Supabase storage
 * Removes problematic query parameters and ensures valid URL format
 */
export function cleanImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    
    // Remove image transformation parameters that might cause loading issues
    urlObj.searchParams.delete('quality');
    urlObj.searchParams.delete('width');
    urlObj.searchParams.delete('height');
    urlObj.searchParams.delete('resize');
    
    // Convert render URLs to direct URLs if needed
    if (urlObj.pathname.includes('/render/image/')) {
      const pathMatch = urlObj.pathname.match(/\/render\/image\/public\/(.+)/);
      if (pathMatch) {
        // Reconstruct as direct URL
        urlObj.pathname = `/storage/v1/object/public/${pathMatch[1]}`;
      }
    }
    
    return urlObj.toString();
  } catch (error) {
    console.error('Invalid image URL:', url, error);
    return null;
  }
}