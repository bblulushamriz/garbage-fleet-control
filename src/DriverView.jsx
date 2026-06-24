import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { db, storage } from './firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CENTER = [32.0853, 34.7818];

// אייקון מותאם לנייד של הנהג - קצת יותר גדול ללחיצה קלה עם האצבע
const createDriverIcon = (status) => {
  const colors = { 
    RED: '#e53935',    // מלא / דחוף
    YELLOW: '#fb8c00', // בטיפול
    GREEN: '#43a047',  // פונה וריק
    BLUE: '#1976d2'    // חדש / מאושר
  };
  const color = colors[status] || '#1976d2';
  
  return L.divIcon({
    html: `<div style="
      background-color: ${color}; 
      width: 18px; 
      height: 18px; 
      border-radius: 50%; 
      border: 3px solid white; 
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
    "></div>`,
    className: 'driver-leaflet-pin',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};

// רכיב פנימי שדואג להציג את המפה בדיוק באזור המשימות של הנהג
function FitMapBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [points, map]);
  return null;
}

export default function DriverView() {
  const [points, setPoints] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('נהג 1');
  const [loadingMap, setLoadingMap] = useState({}); // עוקב אחרי סטטוס העלאת קבצים

  // טעינת כל הנקודות הרלוונטיות מ-Firestore שכוללות קואורדינטות
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
      setPoints(data);
    });
    return () => unsub();
  }, []);

  // פונקציית העלאת תמונות (לפני ואחרי) מהשטח
  const handlePhotoUpload = async (pointId, file, type) => {
    if (!file) return;
    const loadKey = `${pointId}_${type}`;
    setLoadingMap(prev => ({ ...prev, [loadKey]: true }));

    try {
      // 1. העלאה ל-Storage
      const fileRef = ref(storage, `driver_reports/${pointId}_${type}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      // 2. עדכון שדה ה-Firestore המתאים
      const fieldToUpdate = type === 'before' ? 'imageUrlBefore' : 'imageUrlAfter';
      await updateDoc(doc(db, 'CollectionPoints', pointId), {
        [fieldToUpdate]: downloadUrl
      });
      alert(`תמונת "${type === 'before' ? 'לפני' : 'אחרי'}" הועלתה בהצלחה!`);
    } catch (error) {
      console.error(error);
      alert("שגיאה בהעלאת התמונה. ודא שהחיבור תקין וחוקי ה-Storage פתוחים.");
    } finally {
      setLoadingMap(prev => ({ ...prev, [loadKey]: false }));
    }
  };

  // עדכון סטטוס המשימה בלחיצת כפתור מהמפה
  const handleStatusChange = async (pointId, newStatus) => {
    try {
      await updateDoc(doc(db, 'CollectionPoints', pointId), { status: newStatus });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0 }}>
      
      {/* תפריט עליון צף (Overlay) לבחירת נהג - מוצמד מעל המפה */}
      <div style={topBarStyle}>
        <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'white' }}>🚚 מפת משימות שטח</div>
        <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={selectStyle}>
          <option value="נהג 1">צוות איסוף 1 (נהג 1)</option>
          <option value="נהג 2">צוות איסוף 2 (נהג 2)</option>
          <option value="נהג 3">צוות איסוף 3 (נהג 3)</option>
        </select>
      </div>

      {/* מפת הניווט והעבודה של הנהג בגודל מלא */}
      <MapContainer center={CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        
        <FitMapBounds points={points} />

        {/* יצירת הנקודות על המפה של הנהג */}
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={createDriverIcon(p.status)}>
            <Popup minWidth={240}>
              <div style={popupContainerStyle}>
                <strong style={{ fontSize: '15px', color: '#1a237e', display: 'block', marginBottom: '2px' }}>{p.address}</strong>
                <div style={{ fontSize: '12px', color: '#555', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  📋 מפגע: {p.issueDescription || 'פינוי רגיל'}
                </div>
                
                {/* 🔄 סרגל עדכון סטטוס מהיר לנהג */}
                <label style={labelStyle}>🔄 עדכן סטטוס מכולה:</label>
                <div style={statusGridStyle}>
                  <button onClick={() => handleStatusChange(p.id, 'RED')} style={statusBtnStyle('#e53935', p.status === 'RED')}>🚨 מלא</button>
                  <button onClick={() => handleStatusChange(p.id, 'YELLOW')} style={statusBtnStyle('#fb8c00', p.status === 'YELLOW')}>⏳ טיפול</button>
                  <button onClick={() => handleStatusChange(p.id, 'GREEN')} style={statusBtnStyle('#43a047', p.status === 'GREEN')}>✅ פונה</button>
                </div>

                {/* 📸 שדה א': צילום תמונה ל-פני הפינוי */}
                <div style={photoBoxStyle}>
                  <div style={photoTitleStyle('#e65100')}>📸 שלב א': תמונה לפני הפינוי</div>
                  {(p.imageUrlBefore || p.imageUrl) && (
                    <img src={p.imageUrlBefore || p.imageUrl} alt="לפני" style={imgPreviewStyle} />
                  )}
                  <label style={fileLabelStyle(loadingMap[`${p.id}_before`], '#fff3e0', '#e65100')}>
                    {loadingMap[`${p.id}_before`] ? '🔄 מעלה תמונה...' : '📷 צלם מכולה מלאה (לפני)'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      disabled={loadingMap[`${p.id}_before`]} 
                      onChange={(e) => handlePhotoUpload(p.id, e.target.files[0], 'before')} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>

                {/* 📸 שדה ב': צילום תמונה ל-אחרי הפינוי */}
                <div style={photoBoxStyle}>
                  <div style={photoTitleStyle('#2e7d32')}>📸 שלב ב': תמונה אחרי הפינוי</div>
                  {p.imageUrlAfter && (
                    <img src={p.imageUrlAfter} alt="אחרי" style={imgPreviewStyle} />
                  )}
                  <label style={fileLabelStyle(loadingMap[`${p.id}_after`], '#e8f5e9', '#2e7d32')}>
                    {loadingMap[`${p.id}_after`] ? '🔄 מעלה תמונה...' : '📷 צלם מכולה נקייה (אחרי)'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      disabled={loadingMap[`${p.id}_after`]} 
                      onChange={(e) => handlePhotoUpload(p.id, e.target.files[0], 'after')} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>

              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

// ============== עיצובים מותאמי מובייל (Mobile-First Style) ==============
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