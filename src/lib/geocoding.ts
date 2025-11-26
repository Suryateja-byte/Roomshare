export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!token) {
        console.error("Mapbox token is missing");
        return null;
    }

    try {
        const encodedAddress = encodeURIComponent(address);
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&limit=1`;

        console.log("Attempting to geocode address:", address);
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Geocoding API error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        // console.log("Mapbox response:", JSON.stringify(data, null, 2));

        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].center;
            console.log(`Successfully geocoded to: lat=${lat}, lng=${lng}`);
            return { lat, lng };
        }

        // No results found
        console.warn("No geocoding results found for address:", address);
        return null;

    } catch (error) {
        console.error("Error geocoding address:", error);
        return null;
    }
}
