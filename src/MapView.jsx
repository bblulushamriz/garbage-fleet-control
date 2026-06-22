import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polygon, Polyline, useMapEvents, Pane } from 'react-leaflet';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import AddPointForm from './AddPointForm';

const CENTER = [32.0853, 34.7818];

const STATUS_COLORS = {
  BLUE: '#1e88e5',   // כחול רויאל לנקודות חדשות
  RED: '#e53935',    // אדום למלא/דחוף
  YELLOW: '#fb8c00', // כתום לחלקי
  GREEN: '#43a047',  // ירוק לפונה/ריק
};

const STATUS_LABELS = {
  BLUE: 'לא ידוע / חדש',
  RED: 'מלא / דחוף',
  YELLOW: 'חלקי',
  GREEN: 'פונה / ריק',
};

const ZONE_COLORS = [
  '#e53935', '#1e88e5', '#8e24aa', '#fdd835', '#fb8c00', 
  '#00acc1', '#d81b60', '#3949ab', '#00897b', '#f4511e'
];

const getZoneColor = (zone) => {
  if (zone.color) return zone.color;
  const name = zone.name || '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % ZONE_COLORS.length;
  return ZONE_COLORS[index];
};

function MapDrawingManager({ drawingMode, tempCoords, setTempCoords }) {
  useMapEvents({
    click(e) {
      if (drawingMode !== 'polygon') return;
      const newPoint = [e.latlng.lat, e.latlng.lng];
      setTempCoords((prev) => [...prev, newPoint]);
    }
  });

  if (tempCoords.length === 0 || drawingMode !== 'polygon') return null;

  return (
    <>
      <Polyline positions={tempCoords} pathOptions={{ color: '#ff1744', weight: 3, dashArray: '6, 6' }} />
      {tempCoords.map((pt, idx) => (
        <CircleMarker key={idx} center={pt} radius={4} pathOptions={{ color: '#ff1744', fillColor: 'white', fillOpacity: 1 }} />
      ))}
    </>
  );
}

function FitBounds({ points }) {
  const map = useMap();
  const fittedCount = useRef(0);

  useEffect(() => {
    if (!points.length || points.length === fittedCount.current) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    fittedCount.current = points.length;
  }, [points, map]);

  return null;
}

export default function MapView() {
  const [points, setPoints] = useState([]);
  const [zones, setZones] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPointId, setEditingPointId] = useState(null);
  const [editData, setEditData] = useState({ address: '', contactName: '', phone: '' });
  
  const [drawingMode, setDrawingMode] = useState(null);
  const [tempCoords, setTempCoords] = useState([]);
  
  const [selectedDriver, setSelectedDriver] = useState('ALL');

  // טעינת נקודות מ-Firebase
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
      setPoints(data);
    });
    return () => unsub();
  }, []);

  // טעינת אזורים מ-Firebase
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Zones'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setZones(data);
    });
    return () => unsub();
  }, []);

  const savePolygonZone = async () => {
    if (tempCoords.length < 3) {
      alert("פוליגון חייב להכיל לפחות 3 נקודות!");
      return;
    }
    const zoneName = prompt("תן שם לגזרה החדשה (למשל: אזור דרום):");
    if (!zoneName) return;

    const randomColor = ZONE_COLORS[Math.floor(Math.random() * ZONE_COLORS.length)];

    try {
      await addDoc(collection(db, 'Zones'), {
        name: zoneName,
        coordinates: tempCoords.map(pt => ({ lat: pt[0], lng: pt[1] })),
        color: randomColor, 
        driver: selectedDriver, 
        createdAt: new Date()
      });
      setDrawingMode(null);
      setTempCoords([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try { await updateDoc(doc(db, 'CollectionPoints', id), { status: newStatus }); } catch (e) {}
  };

  const handleDelete = async (id) => {
    if (window.confirm('האם למחוק נקודה זו?')) {
      try { await deleteDoc(doc(db, 'CollectionPoints', id)); } catch (e) {}
    }
  };

  const handleDeleteZone = async (id, name) => {
    if (window.confirm(`האם למחוק את גזרת "${name}"?`)) {
      try { await deleteDoc(doc(db, 'Zones', id)); } catch (e) {}
    }
  };

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%', fontFamily: 'sans-serif' }}>
      <MapContainer center={CENTER} zoom={12} style={{ height: '100%', width: '100%', cursor: drawingMode ? 'crosshair' : 'grab' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={points} />
        
        <MapDrawingManager drawingMode={drawingMode} tempCoords={tempCoords} setTempCoords={setTempCoords} />

        {/* פוליגונים */}
        {zones
          .filter((zone) => selectedDriver === 'ALL' || zone.driver === selectedDriver)
          .map((zone) => {
            const zoneColor = getZoneColor(zone);
            return (
              <Polygon
                key={`${zone.id}-${zoneColor}`} 
                positions={zone.coordinates.map(pt => [pt.lat, pt.lng])}
                pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.25, weight: 3 }}
              >
                <Popup>
                  <div style={{ direction: 'rtl', textAlign: 'right', minWidth: '140px' }}>
                    <strong>גזרה: {zone.name}</strong><br />
                    <span style={{ fontSize: '12px', color: '#555' }}>👤 נהג אחראי: {zone.driver === 'ALL' || !zone.driver ? 'טרם שויך' : zone.driver}</span>
                    <button onClick={() => handleDeleteZone(zone.id, zone.name)} style={{ background: '#e53935', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', marginTop: '8px', cursor: 'pointer', width: '100%' }}>מחק גזרה</button>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

        {/* מרקרים שצפים מעל הפוליגונים */}
        <Pane name="top-points-pane" style={{ zIndex: 450 }}>
          {points.map((p) => (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={9}
              pathOptions={{ 
                color: STATUS_COLORS[p.status] || '#1e88e5', 
                fillColor: STATUS_COLORS[p.status] || '#1e88e5', 
                fillOpacity: 0.8 
              }}
            >
              <Popup>
                <div style={{ direction: 'rtl', textAlign: 'right', minWidth: '180px' }}>
                  {editingPointId === p.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input value={editData.address} onChange={(e) => setEditData({...editData, address: e.target.value})} style={inputStyle} />
                      <button onClick={async () => {
                        await updateDoc(doc(db, 'CollectionPoints', p.id), editData);
                        setEditingPointId(null);
                      }} style={{ background: '#43a047', color: 'white', border: 'none', padding: '4px' }}>שמור</button>
                    </div>
                  ) : (
                    <>
                      <strong>{p.address}</strong><br />
                      <span>איש קשר: {p.contactName}</span><br />
                      <span>טלפון: {p.phone}</span><br />
                      
                      {/* הפיצ'ר של שלב 3: הצגת תמונת דיווח חיה מהשטח שהנהג העלה */}
                      {p.imageUrl && (
                        <div style={{ marginTop: '8px', marginBottom: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#1a237e', marginBottom: '3px' }}>📸 דיווח מצולם מהשטח:</div>
                          <a href={p.imageUrl} target="_blank" rel="noreferrer">
                            <img 
                              src={p.imageUrl} 
                              alt="דיווח נהג" 
                              style={{ width: '100%', maxHeight: '100px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #ccc' }} 
                            />
                          </a>
                          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>לחץ על התמונה להגדלה</div>
                        </div>
                      )}

                      <select value={p.status || 'BLUE'} onChange={(e) => handleStatusChange(p.id, e.target.value)} style={{ width: '100%', marginTop: '5px' }}>
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                        <button onClick={() => { setEditingPointId(p.id); setEditData({ address: p.address, contactName: p.contactName, phone: p.phone }); }} style={{ background: '#fb8c00', color: 'white', border: 'none', flex: 1 }}>ערוך</button>
                        <button onClick={() => handleDelete(p.id)} style={{ background: '#e53935', color: 'white', border: 'none', flex: 1 }}>מחק</button>
                      </div>
                    </>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </Pane>
      </MapContainer>

      {/* לוח הבקרה המאוחד */}
      <div style={panelStyle}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '15px', color: '#1a237e', borderBottom: '2px solid #e0e0e0', paddingBottom: '6px', textAlign: 'center' }}>
          לוח בקרת מפקח
        </div>
        
        {/* סינון נהג */}
        <div style={sectionHeaderStyle}>סינון לפי נהג איסוף</div>
        <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={dropdownStyle}>
          <option value="ALL">🌍 כל הנהגים</option>
          <option value="נהג 1">🚚 נהג 1</option>
          <option value="נהג 2">🚚 נהג 2</option>
          <option value="נהג 3">🚚 נהג 3</option>
        </select>

        {/* נקודות איסוף */}
        <div style={{ ...sectionHeaderStyle, marginTop: '12px' }}>נקודות איסוף</div>
        <button onClick={() => setShowForm(!showForm)} style={panelButtonStyle('#1976d2')}>
          {showForm ? '✖ סגור טופס הוספה' : '➕ הוסף נקודה ידנית'}
        </button>

        {/* ניהול גזרות */}
        <div style={{ ...sectionHeaderStyle, marginTop: '12px' }}>ניהול גזרות</div>
        {drawingMode === null ? (
          <button onClick={() => { setDrawingMode('polygon'); setTempCoords([]); }} style={panelButtonStyle('#2e7d32')}>
            📐 הגדרת גזרה חדשה
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '11px', color: '#333', backgroundColor: '#fff3cd', padding: '6px', borderRadius: '4px', border: '1px solid #ffeeba', lineHeight: '1.4' }}>
              לחץ על המפה בנקודות שונות כדי להקיף את הגזרה. {selectedDriver !== 'ALL' && `היא תשויך ל-${selectedDriver}`}
            </div>
            {tempCoords.length >= 3 && (
              <button onClick={savePolygonZone} style={panelButtonStyle('#2e7d32')}>
                ✅ שמור אזור ({tempCoords.length} נק')
              </button>
            )}
            <button onClick={() => { setDrawingMode(null); setTempCoords([]); }} style={panelButtonStyle('#666')}>
              ❌ ביטול ציור
            </button>
          </div>
        )}
      </div>

      {/* הטופס הצף */}
      {showForm && <AddPointForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

const inputStyle = { padding: '5px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', width: '100%' };
const sectionHeaderStyle = { fontSize: '12px', fontWeight: 'bold', color: '#555', marginBottom: '4px', marginTop: '6px' };
const dropdownStyle = { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px', fontWeight: '500', backgroundColor: '#f8f9fa', color: '#333', cursor: 'pointer', outline: 'none', direction: 'rtl' };
const panelStyle = { position: 'absolute', top: '90px', left: '12px', zIndex: 1000, background: 'white', padding: '14px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '4px', width: '180px', direction: 'rtl', textAlign: 'right' };
const panelButtonStyle = (color) => ({ background: color, color: 'white', border: 'none', padding: '9px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', width: '100%', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' });