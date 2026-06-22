import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, FeatureGroup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';

// תיקון קטן ל-Leaflet כדי שהאייקונים יעבדו עם draw
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function MapView() {
  
  const handlePolygonCreated = async (e) => {
    const layer = e.layer;
    const coords = layer.getLatLngs()[0]; // קבלת הקואורדינטות של הפוליגון

    const zoneName = prompt("תן שם לאזור החדש (למשל: אזור צפון):");
    if (!zoneName) return;

    try {
      await addDoc(collection(db, 'Zones'), {
        name: zoneName,
        coordinates: coords,
        createdAt: new Date()
      });
      alert('האזור נשמר בהצלחה!');
    } catch (error) {
      console.error("שגיאה בשמירת האזור:", error);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <MapContainer center={[32.0853, 34.7818]} zoom={12} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        <FeatureGroup>
          <EditControl
            position='topright'
            onCreated={handlePolygonCreated}
            draw={{
              rectangle: false,
              circle: false,
              marker: false,
              circlemarker: false,
              polyline: false,
              polygon: true // מאפשר רק ציור פוליגונים
            }}
          />
        </FeatureGroup>
      </MapContainer>
    </div>
  );
}