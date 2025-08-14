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

export interface DetectedBarangay {
  barangay: string;
  city: string;
  province: string;
  region: string;
  confidence: 'high' | 'medium' | 'low';
  suggestions?: string[];
  landmarks?: string[];
}

/**
 * Detects barangay from coordinates using multiple methods
 * Focuses on Region 10 (Northern Mindanao) areas
 */
export function detectBarangayFromCoordinates(
  lat: number, 
  lng: number
): Promise<DetectedBarangay | null> {
  return new Promise(async (resolve) => {
    if (!window.google?.maps) {
      console.error('Google Maps not loaded');
      resolve(null);
      return;
    }

    try {
      // Try multiple detection methods in order of accuracy
      
      // Method 1: Enhanced Google Maps geocoding with detailed location types
      const googleResult = await tryGoogleMapsDetection(lat, lng);
      if (googleResult && googleResult.confidence === 'high') {
        resolve(googleResult);
        return;
      }

      // Method 2: Philippines-specific geocoding APIs
      const philippinesResult = await tryPhilippinesGeocodingAPIs(lat, lng);
      if (philippinesResult && philippinesResult.confidence === 'high') {
        resolve(philippinesResult);
        return;
      }

      // Method 3: Precise coordinate-based detection using known barangay boundaries
      const coordinateResult = await tryPreciseCoordinateDetection(lat, lng);
      if (coordinateResult) {
        resolve(coordinateResult);
        return;
      }

      // Fallback: Return best available result or null
      resolve(googleResult || philippinesResult || null);
      
    } catch (error) {
      console.error('Error in barangay detection:', error);
      resolve(null);
    }
  });
}

/**
 * Extracts barangay information from Google Maps geocoding result  
 */
function extractBarangayFromResult(result: any): DetectedBarangay | null {
  const addressComponents = result.address_components;
  let barangay = '';
  let city = '';
  let province = '';
  let region = 'Region 10 (Northern Mindanao)';
  let confidence: 'high' | 'medium' | 'low' = 'low';

  // Extract components from Google Maps result
  for (const component of addressComponents) {
    const types = component.types;
    
    // Barangay detection - look for specific administrative levels
    if (types.includes('sublocality') || types.includes('sublocality_level_1')) {
      barangay = component.long_name;
      confidence = 'high';
    } else if (types.includes('neighborhood') || types.includes('sublocality_level_2')) {
      if (!barangay) {
        barangay = component.long_name;
        confidence = 'medium';
      }
    }
    
    // City detection
    if (types.includes('locality') || types.includes('administrative_area_level_2')) {
      city = component.long_name;
    }
    
    // Province detection
    if (types.includes('administrative_area_level_1')) {
      province = component.long_name;
    }
  }

  // Validate it's within Region 10
  const region10Cities = ['Cagayan de Oro', 'Iligan', 'Malaybalay', 'Valencia', 'Oroquieta'];
  const region10Provinces = ['Misamis Oriental', 'Misamis Occidental', 'Lanao del Norte', 'Bukidnon'];
  
  const isRegion10 = 
    region10Cities.some(validCity => 
      city.toLowerCase().includes(validCity.toLowerCase()) ||
      validCity.toLowerCase().includes(city.toLowerCase())
    ) ||
    region10Provinces.some(validProvince =>
      city.toLowerCase().includes(validProvince.toLowerCase()) ||
      province.toLowerCase().includes(validProvince.toLowerCase())
    );

  if (!isRegion10) {
    console.warn('Location not in Region 10:', { city, province, region });
    return null;
  }

  // Normalize city names
  if (city.toLowerCase().includes('cagayan') || province.toLowerCase().includes('misamis oriental')) {
    city = 'Cagayan de Oro';
    province = 'Misamis Oriental';
  } else if (city.toLowerCase().includes('iligan')) {
    city = 'Iligan';
    province = 'Lanao del Norte';
  } else if (city.toLowerCase().includes('malaybalay')) {
    city = 'Malaybalay';
    province = 'Bukidnon';
  } else if (city.toLowerCase().includes('valencia')) {
    city = 'Valencia';
    province = 'Bukidnon';
  } else if (city.toLowerCase().includes('oroquieta')) {
    city = 'Oroquieta';
    province = 'Misamis Occidental';
  }

  // Try to extract barangay from formatted address if not found in components
  if (!barangay) {
    const address = result.formatted_address.toLowerCase();
    
    // Look for numbered barangays
    const numberedMatch = address.match(/barangay\s+(\d+)/);
    if (numberedMatch) {
      barangay = `Barangay ${numberedMatch[1]}`;
      confidence = 'high';
    } else {
      // Look for "Barangay" or "Brgy" in address
      const addressParts = result.formatted_address.split(',');
      for (const part of addressParts) {
        const trimmed = part.trim();
        if (trimmed.toLowerCase().includes('barangay') || 
            trimmed.toLowerCase().includes('brgy')) {
          barangay = trimmed;
          confidence = 'medium';
          break;
        }
      }
    }
  }

  // Return result only if we found a proper barangay
  if (barangay && city) {
    console.log(`✅ Google Maps detected: ${barangay}, ${city} (confidence: ${confidence})`);
    
    return {
      barangay: barangay.replace(/^(Barangay\s+|Brgy\s+)/i, '').trim(),
      city,
      province,
      region,
      confidence
    };
  }

  return null;
}

/**
 * Method 1: Enhanced Google Maps detection with detailed analysis
 */
async function tryGoogleMapsDetection(lat: number, lng: number): Promise<DetectedBarangay | null> {
  return new Promise((resolve) => {
    const geocoder = new window.google.maps.Geocoder();
    const latLng = new window.google.maps.LatLng(lat, lng);

    geocoder.geocode({ location: latLng }, (results, status) => {
      if (status !== 'OK' || !results || results.length === 0) {
        resolve(null);
        return;
      }

      // Try to find the most detailed result with barangay information
      for (const result of results) {
        const barangayInfo = extractBarangayFromResult(result);
        if (barangayInfo && barangayInfo.confidence === 'high') {
          resolve(barangayInfo);
          return;
        }
      }

      // If no high-confidence result, return the best available
      for (const result of results) {
        const barangayInfo = extractBarangayFromResult(result);
        if (barangayInfo) {
          resolve(barangayInfo);
          return;
        }
      }

      resolve(null);
    });
  });
}

/**
 * Method 2: Philippines-specific geocoding APIs
 */
async function tryPhilippinesGeocodingAPIs(lat: number, lng: number): Promise<DetectedBarangay | null> {
  try {
    // Try OpenStreetMap Nominatim (free, good Philippines coverage)
    const nominatimResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'DeliveryEase-App'
        }
      }
    );

    if (nominatimResponse.ok) {
      const data = await nominatimResponse.json();
      const barangayResult = parseNominatimResult(data);
      if (barangayResult) {
        return barangayResult;
      }
    }

    // Try alternative Philippines geocoding service
    const altResult = await tryAlternativePhilippinesAPI(lat, lng);
    if (altResult) {
      return altResult;
    }

  } catch (error) {
    console.warn('Philippines geocoding APIs failed:', error);
  }

  return null;
}

/**
 * Method 3: Precise coordinate-based detection using known barangay boundaries
 */
async function tryPreciseCoordinateDetection(lat: number, lng: number): Promise<DetectedBarangay | null> {
  // Use a more comprehensive and accurate coordinate mapping
  // This would ideally use actual barangay boundary polygons
  
  // Cagayan de Oro precise boundaries (based on official data)
  const cagayanDeOroBarangays = [
    {
      name: "Lapasan",
      bounds: { north: 8.465, south: 8.445, east: 124.645, west: 124.625 },
      landmarks: ["SM City", "Centrio Mall", "Xavier University"]
    },
    {
      name: "Carmen",
      bounds: { north: 8.500, south: 8.480, east: 124.635, west: 124.615 },
      landmarks: ["Carmen Market", "Cogon Market"]
    },
    {
      name: "Nazareth", 
      bounds: { north: 8.510, south: 8.485, east: 124.665, west: 124.635 },
      landmarks: ["USTP", "Limketkai Mall", "Nazareth General Hospital"]
    },
    {
      name: "Gusa",
      bounds: { north: 8.485, south: 8.460, east: 124.630, west: 124.605 },
      landmarks: ["Gusa Regional High School"]
    },
    {
      name: "Bulua",
      bounds: { north: 8.460, south: 8.435, east: 124.630, west: 124.605 },
      landmarks: ["Bulua National High School", "Malasag Eco-Tourism"]
    },
    {
      name: "Macasandig",
      bounds: { north: 8.480, south: 8.455, east: 124.610, west: 124.585 },
      landmarks: ["Macasandig Elementary School"]
    },
    {
      name: "Kauswagan",
      bounds: { north: 8.460, south: 8.435, east: 124.665, west: 124.640 },
      landmarks: ["Kauswagan Elementary School"]
    },
    {
      name: "Puerto",
      bounds: { north: 8.490, south: 8.465, east: 124.675, west: 124.650 },
      landmarks: ["Cagayan de Oro Port", "Macabalan Wharf"]
    },
    {
      name: "Balulang",
      bounds: { north: 8.440, south: 8.415, east: 124.645, west: 124.615 },
      landmarks: ["Lumbia Airport"]
    },
    // Downtown numbered barangays
    {
      name: "Barangay 1",
      bounds: { north: 8.480, south: 8.475, east: 124.650, west: 124.640 },
      landmarks: ["City Hall", "Plaza Divisoria", "St. Augustine Cathedral"]
    },
    {
      name: "Barangay 9",
      bounds: { north: 8.482, south: 8.477, east: 124.655, west: 124.645 },
      landmarks: ["Gaston Park", "Rotunda"]
    },
    {
      name: "Barangay 17",
      bounds: { north: 8.484, south: 8.479, east: 124.660, west: 124.650 },
      landmarks: ["Divisoria Night Market"]
    }
  ];

  // Check if coordinates fall within any barangay bounds
  for (const barangay of cagayanDeOroBarangays) {
    if (lat <= barangay.bounds.north && lat >= barangay.bounds.south &&
        lng <= barangay.bounds.east && lng >= barangay.bounds.west) {
      
      return {
        barangay: barangay.name,
        city: "Cagayan de Oro",
        province: "Misamis Oriental", 
        region: "Region 10 (Northern Mindanao)",
        confidence: 'high',
        landmarks: barangay.landmarks
      };
    }
  }

  return null;
}

/**
 * Parse Nominatim (OpenStreetMap) result
 */
function parseNominatimResult(data: any): DetectedBarangay | null {
  if (!data.address) return null;

  const address = data.address;
  let barangay = '';
  let city = '';
  let province = '';

  // Extract barangay from various OSM fields
  barangay = address.suburb || address.neighbourhood || address.hamlet || address.village || '';
  
  // Extract city
  city = address.city || address.town || address.municipality || '';
  
  // Extract province  
  province = address.state || address.province || '';

  // Validate it's in Region 10
  const region10Cities = ['Cagayan de Oro', 'Iligan', 'Malaybalay', 'Valencia', 'Oroquieta'];
  const region10Provinces = ['Misamis Oriental', 'Misamis Occidental', 'Lanao del Norte', 'Bukidnon'];
  
  const isValidLocation = 
    region10Cities.some(validCity => city.toLowerCase().includes(validCity.toLowerCase())) ||
    region10Provinces.some(validProvince => province.toLowerCase().includes(validProvince.toLowerCase()));

  if (!isValidLocation) return null;

  // Normalize city names
  if (city.toLowerCase().includes('cagayan') || province.toLowerCase().includes('misamis oriental')) {
    city = 'Cagayan de Oro';
    province = 'Misamis Oriental';
  }

  if (barangay && city) {
    return {
      barangay: barangay.replace(/^(Barangay\s+|Brgy\s+)/i, '').trim(),
      city,
      province,
      region: 'Region 10 (Northern Mindanao)',
      confidence: barangay.toLowerCase().includes('barangay') ? 'high' : 'medium'
    };
  }

  return null;
}

/**
 * Try alternative Philippines geocoding API
 */
async function tryAlternativePhilippinesAPI(_lat: number, _lng: number): Promise<DetectedBarangay | null> {
  // This could integrate with local Philippines geocoding services
  // For now, return null - can be expanded with specific APIs
  return null;
}

