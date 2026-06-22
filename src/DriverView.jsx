import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Polygon } from 'react-leaflet';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import 'leaflet/dist/leaflet.css';

const CENTER = [32.0853, 34.7818];

const STATUS_COLORS = { BLUE: '#1e88e5', RED: '#e53935', YELLOW: '#fb8c00', GREEN: '#43a047' };
const STATUS_LABELS = { BLUE: 'חדש / לא ידוע', RED: 'מלא / דחוף', YELLOW: 'חלקי', GREEN: 'פונה / ריק' };

// פונקציה גיאוגרפית שבודקת האם נקודה נמצאת בתוך פוליגון
function isPointInPolygon(point, polygonCoords) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
    const xi = polygonCoords[i].lat, yi = polygonCoords[i].lng;
    const xj = polygonCoords[j].lat, yj = polygonCoords[j].lng;
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function DriverView() {
  const [driver, setDriver] = useState(localStorage.getItem('assigned_driver') || null);
  const [points, setPoints] = useState([]);
  const [zones, setZones] = useState([]);
  const [uploadingId, setUploadingId] = useState(null);

  // שמירת הנהג בזיכרון המכשיר שלא יצטרך לבחור כל פעם מחדש
  const handleSelectDriver = (name) => {
    setDriver(name);
    localStorage.setItem('assigned_driver', name);
  };

  // טעינת נתונים
  useEffect(() => {
    const unsubPoints = onSnapshot(collection(db, 'CollectionPoints'), (snap) => {
      setPoints(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubZones = onSnapshot(collection(db, 'Zones'), (snap) => {
      setZones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubPoints(); unsubZones(); };
  }, []);

  // סינון הגזרות השייכות לנהג זה
  const myZones = zones.filter(z => z.driver === driver);

  // סינון אוטומטי של נקודות שנמצאות פיזית בתוך הגזרות של הנהג
  const myPoints = points.filter(p => {
    return myZones.some(zone => isPointInPolygon([p.lat, p.lng], zone.coordinates));
  });

  // פונקציית העלאת תמונה ל-Firebase Storage ועדכון הנקודה
  const handlePhotoUpload = async (pointId, file) => {
    if (!file) return;
    setUploadingId(pointId);
    try {
      const fileRef = ref(storage, `driver_reports/${pointId}_${Date.now()}.jpg`);
      await uploadBytes(fileRef, file);
      const imageUrl = await getDownloadURL(fileRef);
      
      // עדכון ה-URL של התמונה וזמן הדיווח בתוך הנקודה ב-Firestore
      await updateDoc(doc(db, 'CollectionPoints', pointId), {
        imageUrl: imageUrl,
        reportedAt: new Date()
      });
      alert("התמונה הועלתה והתעדכנה במערכת הראשית!");
    } catch (e) {
      console.error(e);
      alert("שגיאה בהעלאת התמונה. ודא שרכיב ה-Storage מופעל ב-Firebase.");
    } finally {
      setUploadingId(null);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    await updateDoc(doc(db, 'CollectionPoints', id), { status: newStatus });
  };

  // מסך א': בחירת נהג (מוצג רק בפעם הראשונה)
  if (!driver) {
    return (
      <div style={loginContainerStyle}>
        <div style={loginCardStyle}>
          <h2>🚚 כניסת נהג איסוף</h2>
          <p>בחר את שמך כדי לקבל את מפת הגזרות האישית שלך:</p>
          <button onClick={() => handleSelectDriver('נהג 1')} style={loginButtonStyle('#1e88e5')}>🚚 נהג 1</button>
          <button onClick={() => handleSelectDriver('נהג 2')} style={loginButtonStyle('#fb8c00')}>🚚 נהג 2</button>
          <button onClick={() => handleSelectDriver('נהג 3')} style={loginButtonStyle('#43a047')}>🚚 נהג 3</button>
        </div>
      </div>
    );
  }

  // מסך ב': ממשק העבודה של הנהג בשטח
  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%', fontFamily: 'sans-serif', direction: 'rtl' }}>
      {/* שורת כותרת עליונה */}
      <div style={topBarStyle}>
        <span>שלום, <b>{driver}</b> 🛠️ ({myPoints.length} נקודות בגזרה שלך)</span>
        <button onClick={() => { setDriver(null); localStorage.removeItem('assigned_driver'); }} style={logoutButtonStyle}>החלף נהג</button>
      </div>

      <MapContainer center={CENTER} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* הצגת הגזרות של הנהג בלבד */}
        {myZones.map((zone) => (
          <Polygon key={zone.id} positions={zone.coordinates.map(pt => [pt.lat, pt.lng])} pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.15, weight: 2 }} />
        ))}

        {/* הצגת הנקודות שבתוך הגזרה שלו בלבד */}
        {myPoints.map((p) => (
          <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={12} pathOptions={{ color: STATUS_COLORS[p.status] || '#1e88e5', fillColor: STATUS_COLORS[p.status] || '#1e88e5', fillOpacity: 0.85 }}>
            <Popup>
              <div style={{ textAlign: 'right', minWidth: '190px' }}>
                <strong style={{ fontSize: '14px' }}>{p.address}</strong><br />
                <span style={{ fontSize: '12px', color: '#666' }}>איש קשר: {p.contactName} ({p.phone})</span>
                
                <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>עדכן סטטוס פינוי:</label>
                  <select value={p.status || 'BLUE'} onChange={(e) => handleStatusChange(p.id, e.target.value)} style={selectStyle}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                {/* כפתור צילום תמונה מהנייד */}
                <div style={{ marginTop: '10px' }}>
                  <label style={photoLabelStyle(uploadingId === p.id)}>
                    {uploadingId === p.id ? '🔄 מעלה תמונה...' : '📸 צלם תמונת מצב'}
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" // פותח את המצלמה האחורית בנייד אוטומטית!
                      disabled={uploadingId === p.id}
                      onChange={(e) => handlePhotoUpload(p.id, e.target.files[0])} 
                      style={{ display: 'none' }} 
                    />
                  </label>
                </div>

                {p.imageUrl && (
                  <div style={{ marginTop: '8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#43a047' }}>✅ קיימת תמונה במערכת</span>
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

// עיצובים ממשק נהג
const loginContainerStyle = { display: 'flex', height: '100vh', background: '#f0f2f5', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif', direction: 'rtl' };
const loginCardStyle = { background: 'white', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', width: '320px' };
const loginButtonStyle = (color) => ({ width: '100%', padding: '12px', margin: '8px 0', border: 'none', borderRadius: '8px', color: 'white', background: color, fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' });
const topBarStyle = { position: 'absolute', top: 0, left: 0, right: 0, height: '50px', background: 'white', zIndex: 1000, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 15px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', fontSize: '14px' };
const logoutButtonStyle = { background: '#f44336', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' };
const selectStyle = { width: '100%', padding: '6px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '13px' };
const photoLabelStyle = (loading) => ({ display: 'block', textAlign: 'center', background: loading ? '#9e9e9e' : '#e1f5fe', color: loading ? '#fff' : '#0288d1', padding: '8px', borderRadius: '6px', border: loading ? 'none' : '1px dashed #0288d1', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' });