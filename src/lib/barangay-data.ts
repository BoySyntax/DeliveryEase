/**
 * Enhanced barangay data with landmarks and common areas
 * This helps users identify their barangay based on familiar locations
 */

export interface BarangayLandmark {
  barangay: string;
  city: string;
  landmarks: string[];
  areas: string[];
  description: string;
}

export const BARANGAY_LANDMARKS: BarangayLandmark[] = [
  // Cagayan de Oro City
  {
    barangay: "Lapasan",
    city: "Cagayan de Oro",
    landmarks: ["SM City Cagayan de Oro", "Centrio Mall", "Xavier University"],
    areas: ["SM area", "Centrio area", "Xavier University area"],
    description: "Main commercial district with major malls and universities"
  },
  {
    barangay: "Carmen", 
    city: "Cagayan de Oro",
    landmarks: ["Carmen Market", "Cogon Market", "Carmen Public Market"],
    areas: ["Carmen Market area", "Cogon area"],
    description: "Traditional market area and residential district"
  },
  {
    barangay: "Nazareth",
    city: "Cagayan de Oro", 
    landmarks: ["USTP", "Nazareth General Hospital", "Limketkai Mall"],
    areas: ["USTP area", "Limketkai area", "J.R. Borja Extension"],
    description: "University area and northern commercial district"
  },
  {
    barangay: "Gusa",
    city: "Cagayan de Oro",
    landmarks: ["Gusa Regional High School", "Gusa Elementary School"],
    areas: ["Gusa proper", "Upper Gusa"],
    description: "Residential and educational area"
  },
  {
    barangay: "Bulua",
    city: "Cagayan de Oro",
    landmarks: ["Bulua National High School", "Malasag Eco-Tourism Village"],
    areas: ["Bulua proper", "Malasag area"],
    description: "Mix of residential and eco-tourism areas"
  },
  {
    barangay: "Macasandig",
    city: "Cagayan de Oro",
    landmarks: ["Macasandig Elementary School", "Macasandig River"],
    areas: ["Macasandig proper", "Lower Macasandig"],
    description: "Riverside residential community"
  },
  {
    barangay: "Kauswagan",
    city: "Cagayan de Oro",
    landmarks: ["Kauswagan Elementary School", "Cagayan River"],
    areas: ["Kauswagan proper", "Riverside area"],
    description: "Riverside community near the port area"
  },
  {
    barangay: "Puerto",
    city: "Cagayan de Oro",
    landmarks: ["Cagayan de Oro Port", "Macabalan Wharf"],
    areas: ["Port area", "Macabalan area"],
    description: "Main port and shipping district"
  },
  {
    barangay: "Balulang",
    city: "Cagayan de Oro",
    landmarks: ["Lumbia Airport", "Balulang Elementary School"],
    areas: ["Airport area", "Upper Balulang"],
    description: "Airport vicinity and residential area"
  },
  
  // Downtown Barangays (Numbered)
  {
    barangay: "Barangay 1",
    city: "Cagayan de Oro",
    landmarks: ["City Hall", "Plaza Divisoria", "St. Augustine Cathedral"],
    areas: ["City Hall area", "Downtown proper", "Plaza area"],
    description: "Government center and historical downtown"
  },
  {
    barangay: "Barangay 9", 
    city: "Cagayan de Oro",
    landmarks: ["Gaston Park", "Rotunda", "Downtown commercial area"],
    areas: ["Gaston Park area", "Rotunda area"],
    description: "Central business district"
  },
  {
    barangay: "Barangay 17",
    city: "Cagayan de Oro", 
    landmarks: ["Divisoria Night Market", "Cogon Public Market"],
    areas: ["Night market area", "Divisoria area"],
    description: "Commercial and market district"
  },

  // Iligan City
  {
    barangay: "Poblacion",
    city: "Iligan",
    landmarks: ["Iligan City Hall", "Maria Cristina Falls"],
    areas: ["City center", "Downtown Iligan"],
    description: "Government and commercial center"
  },
  {
    barangay: "Tibanga",
    city: "Iligan",
    landmarks: ["MSU-Iligan Institute of Technology", "Tibanga Airport"],
    areas: ["MSU-IIT area", "Airport area"],
    description: "University and airport district"
  },

  // Malaybalay City
  {
    barangay: "Poblacion", 
    city: "Malaybalay",
    landmarks: ["Malaybalay City Hall", "Central Mindanao University"],
    areas: ["City center", "CMU area"],
    description: "Government center and university area"
  }
];

/**
 * Search for barangay based on landmarks or area descriptions
 */
export function findBarangayByLandmark(searchText: string, city: string): BarangayLandmark[] {
  const search = searchText.toLowerCase();
  
  return BARANGAY_LANDMARKS.filter(item => {
    if (item.city !== city) return false;
    
    return (
      item.landmarks.some(landmark => landmark.toLowerCase().includes(search)) ||
      item.areas.some(area => area.toLowerCase().includes(search)) ||
      item.description.toLowerCase().includes(search) ||
      search.includes(item.barangay.toLowerCase())
    );
  });
}

/**
 * Get suggestions based on detected coordinates and nearby landmarks
 */
export function getBarangaySuggestions(lat: number, lng: number, city: string): string[] {
  const suggestions: string[] = [];
  
  // Add general guidance based on coordinate patterns
  if (city === "Cagayan de Oro") {
    if (lat > 8.48) {
      suggestions.push("You appear to be in the northern part of the city. Consider: Nazareth, Carmen areas.");
    } else if (lat < 8.45) {
      suggestions.push("You appear to be in the southern part of the city. Consider: Bulua, Balulang areas.");
    } else {
      suggestions.push("You appear to be in the central part of the city. Consider: Lapasan, Gusa, downtown barangays.");
    }
    
    if (lng > 124.65) {
      suggestions.push("You're near the eastern/port areas. Consider: Puerto, Kauswagan.");
    } else if (lng < 124.62) {
      suggestions.push("You're in the western areas. Consider: Macasandig, Gusa.");
    }
  }
  
  return suggestions;
}
