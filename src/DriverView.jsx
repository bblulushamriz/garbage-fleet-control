import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon, useMap } from 'react-leaflet';
import { db, storage } from './firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CENTER = [32.0853, 34.7818];

const STATUS_COLORS = { BLUE: '#1e88e5', RED: '#e53935', YELLOW: '#fb8c00', GREEN: '#43a047' };
const ZONE_COLORS = ['#e53935', '#1e88e5', '#8e24aa', '#fdd835', '#fb8c00', '#00acc1', '#d81b60', '#3949ab', '#00897b', '#f4511e'];

const getZoneColor = (zone) => {
  if (zone.color) return zone.color;
  const name = zone.name || '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
  return ZONE_COLORS[Math.abs(hash) % ZONE_COLORS.length];
};

// אלגוריתם Ray-Casting לבדיקה גיאוגרפית האם נקודה נמצאת בתוך פוליגון
const isPointInPolygon = (lat, lng, polygonCoords) => {
  if (!polygonCoords || polygonCoords.length < 3) return false;
  
  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i].lat, yi = polygonCoords[i].lng;
    const xj = polygonCoords[j].lat, yj = polygonCoords[j].lng;
    
    const intersect = ((yi > lng) !== (yj > lng))
        && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

function FitMapBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }, [points, map]);
  return null;
}

export default function DriverView() {
  const [points, setPoints] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('נהג 1');
  const [loadingMap, setLoadingMap] = useState({});

  // 1. טעינת כל המכולות מה-Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
      setPoints(data);
    });
    return () => unsub();
  }, []);

  // 2. טעינת גזרות האיסוף (הפוליגונים) מה-Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Zones'), (snapshot) => {
      setZones(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // 3. עדכון סטטוס מכולה מהשטח
  const handleStatusChange = async (pointId, newStatus) => {
    try {
      await updateDoc(doc(db, 'CollectionPoints', pointId), { status: newStatus });
    } catch (e) {
      console.error(e);
    }
  };

  // 4. העלאת תמונות תיעוד (לפני / אחרי) מהשטח ל-Storage
  const handlePhotoUpload = async (pointId, file, type) => {
    if (!file) return;
    const loadKey = `${pointId}_${type}`;
    setLoadingMap((prev) => ({ ...prev, [loadKey]: true }));

    try {
      const fileRef = ref(storage, `driver_reports/${pointId}_${type}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      const fieldToUpdate = type === 'before' ? 'imageUrlBefore' : 'imageUrlAfter';
      await updateDoc(doc(db, 'CollectionPoints', pointId), {
        [fieldToUpdate]: downloadUrl
      });
      alert(`תמונת "${type === 'before' ? 'לפני הפינוי' : 'אחרי הפינוי'}" הועלתה בהצלחה!`);
    } catch (error) {
      console.error(error);
      alert("שגיאה בהעלאת התמונה.");
    } finally {
      setLoadingMap((prev) => ({ ...prev, [loadKey]: false }));
    }
  };

  // סינון גזרות ונקודות לפי הנהג הנבחר (Geo-fencing)
  const filteredZones = zones.filter((zone) => zone.driver === selectedDriver);
  const filteredPoints = points.filter((point) => {
    return filteredZones.some((zone) => isPointInPolygon(point.lat, point.lng, zone.coordinates));
  });

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0 }}>
      
      {/* בר עליון צף לבחירת צוות איסוף */}
      <div style={topBarStyle}>
        <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'white' }}>🚚 מפת משימות וגזרות שטח</div>
        <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={selectStyle}>
          <option value="נהג 1">צוות איסוף 1 (נהג 1)</option>
          <option value="נהג 2">צוות איסוף 2 (נהג 2)</option>
          <option value="נהג 3">צוות איסוף 3 (נהג 3)</option>
        </select>
      </div>

      {/* המפה בגודל מלא עבור הנהג */}
      <MapContainer center={CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        <FitMapBounds points={filteredPoints} />

        {/* גזרת איסוף */}
        {filteredZones.map((zone) => {
          const zoneColor = getZoneColor(zone);
          return (
            <Polygon 
              key={zone.id} 
              positions={zone.coordinates.map(pt => [pt.lat, pt.lng])} 
              pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.18, weight: 4 }}
            />
          );
        })}

        {/* נקודות מכולה בגזרה */}
        {filteredPoints.map((p) => (
          <CircleMarker 
            key={p.id} 
            center={[p.lat, p.lng]} 
            radius={10} 
            pathOptions={{ color: STATUS_COLORS[p.status] || '#1976d2', fillColor: STATUS_COLORS[p.status] || '#1976d2', fillOpacity: 0.85 }}
          >
            <Popup minWidth={240}>
              <div style={popupContainerStyle}>
                <strong style={{ fontSize: '15px', color: '#1a237e', display: 'block', marginBottom: '2px' }}>{p.address}</strong>
                <div style={{ fontSize: '12px', color: '#555', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  📋 מכולת גזרה: {p.issueDescription || 'פינוי סדיר'}
                </div>
                
                {/* עדכון סטטוס */}
                <label style={labelStyle}>🔄 עדכן מצב מכולה:</label>
                <div style={statusGridStyle}>
                  <button onClick={() => handleStatusChange(p.id, 'RED')} style={statusBtnStyle('#e53935', p.status === 'RED')}>🚨 מלא</button>
                  <button onClick={() => handleStatusChange(p.id, 'YELLOW')} style={statusBtnStyle('#fb8c00', p.status === 'YELLOW')}>⏳ טיפול</button>
                  <button onClick={() => handleStatusChange(p.id, 'GREEN')} style={statusBtnStyle('#43a047', p.status === 'GREEN')}>✅ פונה</button>
                </div>

                {/* 📸 שדה א': תמונה לפני הפינוי (עם קשר קשיח ומזהה ייחודי) */}
                <div style={photoBoxStyle}>
                  <div style={photoTitleStyle('#e65100')}>📸 שלב א': תמונה לפני הפינוי</div>
                  {(p.imageUrlBefore || p.imageUrl) && (
                    <img src={p.imageUrlBefore || p.imageUrl} alt="לפני" style={imgPreviewStyle} />
                  )}
                  <label htmlFor={`file-before-${p.id}`} style={fileLabelStyle(loadingMap[`${p.id}_before`], '#fff3e0', '#e65100')}>
                    {loadingMap[`${p.id}_before`] ? '🔄 מעלה תמונה...' : '📷 צלם מכולה מלאה (לפני)'}
                  </label>
                  <input 
                    id={`file-before-${p.id}`} // ◄-- מזהה ייחודי קשיח מונע בלבול דפדפנים
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    disabled={loadingMap[`${p.id}_before`]} 
                    onClick={(e) => { e.target.value = null; }} // ◄-- מאפס ערך כדי לאפשר צילום חוזר תמיד
                    onChange={(e) => handlePhotoUpload(p.id, e.target.files[0], 'before')} 
                    style={{ display: 'none' }} 
                  />
                </div>

                {/* 📸 שדה ב': תמונה אחרי הפינוי (פתרון החסימה הדינמית) */}
                <div style={photoBoxStyle}>
                  <div style={photoTitleStyle('#2e7d32')}>📸 שלב ב': תמונה אחרי הפינוי</div>
                  {p.imageUrlAfter && (
                    <img src={p.imageUrlAfter} alt="אחרי" style={imgPreviewStyle} />
                  )}
                  <label htmlFor={`file-after-${p.id}`} style={fileLabelStyle(loadingMap[`${p.id}_after`], '#e8f5e9', '#2e7d32')}>
                    {loadingMap[`${p.id}_after`] ? '🔄 מעלה תמונה...' : '📷 צלם מכולה ריקה (אחרי)'}
                  </label>
                  <input 
                    id={`file-after-${p.id}`} // ◄-- הפרדה מוחלטת לשדה השני למניעת התנגשות גיאומטרית בדפדפני מובייל
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    disabled={loadingMap[`${p.id}_after`]} 
                    onClick={(e) => { e.target.value = null; }} // ◄-- מאפס ערך
                    onChange={(e) => handlePhotoUpload(p.id, e.target.files[0], 'after')} 
                    style={{ display: 'none' }} 
                  />
                </div>

              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// עיצובים
const topBarStyle = { position: 'absolute', top: '12px', left: '12px', right: '12px', zIndex: 1100, background: '#1a237e', padding: '10px 14px', borderRadius: '10px', boxShadow: '0 3px 10px rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl', fontFamily: 'sans-serif' };
const selectStyle = { padding: '6px 10px', borderRadius: '6px', border: 'none', fontSize: '13px', fontWeight: 'bold', color: '#1a237e', background: 'white', outline: 'none', cursor: 'pointer' };
const popupContainerStyle = { direction: 'rtl', textAlign: 'right', fontFamily: 'sans-serif', padding: '2px', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#333' };
const statusGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px', marginBottom: '12px' };
const statusBtnStyle = (color, active) => ({ background: active ? color : '#f5f5f5', color: active ? 'white' : '#555', border: active ? 'none' : '1px solid #ccc', padding: '9px 2px', borderRadius: '5px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' });
const photoBoxStyle = { background: '#fcfcfc', border: '1px solid #e2e2e2', padding: '6px', borderRadius: '6px', marginBottom: '8px', boxSizing: 'border-box' };
const photoTitleStyle = (color) => ({ fontSize: '11px', fontWeight: 'bold', color: color, marginBottom: '4px' });
const imgPreviewStyle = { width: '100%', maxHeight: '90px', objectFit: 'cover', borderRadius: '4px', marginBottom: '4px', border: '1px solid #ddd' };
const fileLabelStyle = (loading, bgColor, textColor) => ({ display: 'block', textAlign: 'center', background: loading ? '#e0e0e0' : bgColor, color: loading ? '#666' : textColor, padding: '8px', borderRadius: '4px', border: `1px dashed ${textColor}`, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '12px', marginTop: '2px' });