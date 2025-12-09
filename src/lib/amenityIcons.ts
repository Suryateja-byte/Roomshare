import {
    Wifi,
    Thermometer,
    Snowflake,
    Car,
    Dumbbell,
    WashingMachine,
    ChefHat,
    Tv,
    Laptop,
    Waves,
    Cat,
    ShieldCheck,
    ArrowUp,
    Sun,
    Warehouse,
    Bed,
    Bath,
    Coffee,
    Utensils,
    Microwave,
    Fan,
    Lock,
    type LucideIcon
} from 'lucide-react';

// Map common amenity names to their icons
const amenityIconMap: Record<string, LucideIcon> = {
    // Internet & Tech
    'wifi': Wifi,
    'internet': Wifi,
    'wi-fi': Wifi,
    'wireless': Wifi,
    'workspace': Laptop,
    'desk': Laptop,
    'tv': Tv,
    'television': Tv,
    'cable': Tv,

    // Climate
    'heating': Thermometer,
    'heat': Thermometer,
    'air conditioning': Snowflake,
    'ac': Snowflake,
    'a/c': Snowflake,
    'cooling': Snowflake,
    'fan': Fan,

    // Transportation
    'parking': Car,
    'garage': Car,
    'car': Car,

    // Fitness & Recreation
    'gym': Dumbbell,
    'gym access': Dumbbell,
    'fitness': Dumbbell,
    'exercise': Dumbbell,
    'pool': Waves,
    'swimming': Waves,

    // Laundry
    'washer': WashingMachine,
    'dryer': WashingMachine,
    'washer/dryer': WashingMachine,
    'laundry': WashingMachine,
    'washing machine': WashingMachine,

    // Kitchen
    'kitchen': ChefHat,
    'full kitchen': ChefHat,
    'microwave': Microwave,
    'coffee': Coffee,
    'coffee maker': Coffee,
    'utensils': Utensils,
    'cookware': Utensils,

    // Bedroom & Bath
    'furnished': Bed,
    'bedroom': Bed,
    'bed': Bed,
    'bathroom': Bath,
    'private bath': Bath,
    'ensuite': Bath,

    // Security
    'security': ShieldCheck,
    'secure': ShieldCheck,
    'locked': Lock,
    'doorman': ShieldCheck,

    // Building
    'elevator': ArrowUp,
    'lift': ArrowUp,
    'balcony': Sun,
    'patio': Sun,
    'terrace': Sun,
    'storage': Warehouse,
    'closet': Warehouse,

    // Pets
    'pet friendly': Cat,
    'pets allowed': Cat,
    'pets': Cat,
};

/**
 * Get the icon component for a given amenity name
 * Returns undefined if no matching icon is found
 */
export function getAmenityIcon(amenityName: string): LucideIcon | undefined {
    const normalized = amenityName.toLowerCase().trim();

    // Direct match
    if (amenityIconMap[normalized]) {
        return amenityIconMap[normalized];
    }

    // Partial match - check if any key is contained in the amenity name
    for (const [key, icon] of Object.entries(amenityIconMap)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return icon;
        }
    }

    return undefined;
}

/**
 * Get all amenities with their icons
 * Returns array of { name, icon } objects
 */
export function getAmenitiesWithIcons(amenities: string[]): Array<{ name: string; icon: LucideIcon | undefined }> {
    return amenities.map(amenity => ({
        name: amenity,
        icon: getAmenityIcon(amenity)
    }));
}
