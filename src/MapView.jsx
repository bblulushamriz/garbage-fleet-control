import { useEffect, useState, useRef } from 'react'; // ◄-- התיקון כאן! הוספנו את useRef
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Polygon, Polyline, useMapEvents, Pane } from 'react-leaflet';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import AddPointForm from './AddPointForm';

const CENTER = [32.0853, 34.7818];

const STATUS_COLORS = { BLUE: '#1e88e5', RED: '#e53935', YELLOW: '#fb8c00', GREEN: '#43a047' };
const STATUS_LABELS = { BLUE: 'חדש / מאושר', RED: 'מלא / דחוף', YELLOW: 'בטיפול', GREEN: 'פונה / ריק' };
const ZONE_COLORS = ['#e53935', '#1e88e5', '#8e24aa', '#fdd835', '#fb8c00', '#00acc1', '#d81b60', '#3949ab', '#00897b', '#f4511e'];

const getZoneColor = (zone) => {
  if (zone.color) return zone.color;
  const name = zone.name || '';
  let hash = 0;
  for (let i = 0; i < name.length; i++) { hash = name.charCodeAt(i) + ((hash << 5) - hash); }
  return ZONE_COLORS[Math.abs(hash) % ZONE_COLORS.length];
};

function MapDrawingManager({ drawingMode, tempCoords, setTempCoords }) {
  useMapEvents({
    click(e) {
      if (drawingMode !== 'polygon') return;
      setTempCoords((prev) => [...prev, [e.latlng.lat, e.latlng.lng]]);
    }
  });
  if (tempCoords.length === 0 || drawingMode !== 'polygon') return null;
  return (
    <>
      <Polyline positions={tempCoords} pathOptions={{ color: '#ff1744', weight: 3, dashArray: '6, 6' }} />
      {tempCoords.map((pt, idx) => <CircleMarker key={idx} center={pt} radius={4} pathOptions={{ color: '#ff1744', fillColor: 'white', fillOpacity: 1 }} />)}
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
  const [pendingReports, setPendingReports] = useState([]); 
  const [showForm, setShowForm] = useState(false);
  const [editingPointId, setEditingPointId] = useState(null);
  const [editData, setEditData] = useState({ address: '', contactName: '', phone: '' });
  const [drawingMode, setDrawingMode] = useState(null);
  const [tempCoords, setTempCoords] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('ALL');

  // 1. טעינת נקודות מ-Firebase
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
      setPoints(data);
    });
    return () => unsub();
  }, []);

  // 2. טעינת גזרות מ-Firebase
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Zones'), (snapshot) => {
      setZones(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // 3. טעינת דיווחים ממתינים של אזרחים
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'PendingReports'), (snapshot) => {
      setPendingReports(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  const handleApproveReport = async (report) => {
    try {
      await addDoc(collection(db, 'CollectionPoints'), {
        address: report.address,
        issueDescription: report.issueDescription || 'דיווח אזרח',
        contactName: report.contactName || 'אזרח',
        phone: report.phone || '',
        lat: report.lat,
        lng: report.lng,
        status: 'BLUE', 
        imageUrlBefore: report.imageUrl || '', 
        createdAt: new Date()
      });
      await deleteDoc(doc(db, 'PendingReports', report.id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectReport = async (id) => {
    if (window.confirm('האם למחוק דיווח זה?')) {
      try { await deleteDoc(doc(db, 'PendingReports', id)); } catch (e) {}
    }
  };

  const savePolygonZone = async () => {
    if (tempCoords.length < 3) { alert("פוליגון חייב להכיל לפחות 3 נקודות!"); return; }
    const zoneName = prompt("תן שם לגזרה החדשה:");
    if (!zoneName) return;
    try {
      await addDoc(collection(db, 'Zones'), {
        name: zoneName, coordinates: tempCoords.map(pt => ({ lat: pt[0], lng: pt[1] })),
        driver: selectedDriver, createdAt: new Date()
      });
      setDrawingMode(null); setTempCoords([]);
    } catch (e) {}
  };

  const handleStatusChange = async (id, newStatus) => {
    try { await updateDoc(doc(db, 'CollectionPoints', id), { status: newStatus }); } catch (e) {}
  };

  const handleClearPhotos = async (id) => {
    if (window.confirm('האם אתה בטוח שברצונך למחוק את תמונות התיעוד (לפני ואחרי) של מכולה זו?')) {
      try {
        await updateDoc(doc(db, 'CollectionPoints', id), {
          imageUrlBefore: '',
          imageUrlAfter: '',
          imageUrl: '' 
        });
        alert('תמונות התיעוד אופסו בהצלחה מהמערכת!');
      } catch (e) {
        console.error("Error clearing photos:", e);
      }
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('האם למחוק נקודה זו לחלוטין מהמפה?')) { try { await deleteDoc(doc(db, 'CollectionPoints', id)); } catch (e) {} }
  };

  const handleDeleteZone = async (id, name) => {
    if (window.confirm(`האם למחוק את גזרת "${name}"?`)) { try { await deleteDoc(doc(db, 'Zones', id)); } catch (e) {} }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', direction: 'rtl', fontFamily: 'sans-serif' }}>
      
      {/* לוח צדדי: סינון דיווחי תושבים נכנסים */}
      <div style={sidebarStyle}>
        <h2 style={sidebarTitleStyle}>📥 דיווחי תושבים להערכה ({pendingReports.length})</h2>
        <p style={sidebarSubStyle}>מערכת סינון ומודרציה בזמן אמת</p>
        <hr style={dividerStyle} />
        
        <div style={sidebarListContainerStyle}>
          {pendingReports.length === 0 ? (
            <div style={emptyStateStyle}>אין דיווחים ממתינים כעת. המערכת נקייה! ✨</div>
          ) : (
            pendingReports.map((report) => (
              <div key={report.id} style={reportCardStyle}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#1a237e', marginBottom: '4px' }}>📍 {report.address}</div>
                <div style={{ fontSize: '12px', color: '#333', marginBottom: '6px' }}><strong>תיאור:</strong> {report.issueDescription}</div>
                {report.imageUrl && <img src={report.imageUrl} alt="מפגע" style={sidebarImageStyle} />}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                  <button onClick={() => handleApproveReport(report)} style={btnApproveStyle}>✅ אשר משימה</button>
                  <button onClick={() => handleRejectReport(report.id)} style={btnRejectStyle}>🗑️ דחה</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* מפת השליטה והבקרה המרכזית */}
      <div style={{ flexGrow: 1, height: '100%', position: 'relative' }}>
        <MapContainer center={CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds points={points} />
          
          <MapDrawingManager drawingMode={drawingMode} tempCoords={tempCoords} setTempCoords={setTempCoords} />

          {/* גזרות פוליגונים */}
          {zones
            .filter((zone) => selectedDriver === 'ALL' || zone.driver === selectedDriver)
            .map((zone) => {
              const zoneColor = getZoneColor(zone);
              return (
                <Polygon key={zone.id} positions={zone.coordinates.map(pt => [pt.lat, pt.lng])} pathOptions={{ color: zoneColor, fillColor: zoneColor, fillOpacity: 0.2, weight: 3 }}>
                  <Popup>
                    <div style={{ direction: 'rtl', textAlign: 'right', minWidth: '140px' }}>
                      <strong>גזרה: {zone.name}</strong><br />
                      <span style={{ fontSize: '12px', color: '#555' }}>👤 נהג: {zone.driver === 'ALL' || !zone.driver ? 'טרם שויך' : zone.driver}</span>
                      <button onClick={() => handleDeleteZone(zone.id, zone.name)} style={{ background: '#e53935', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', marginTop: '8px', cursor: 'pointer', width: '100%' }}>מחק גזרה</button>
                    </div>
                  </Popup>
                </Polygon>
              );
            })}

          {/* נקודות מכולה על המפה */}
          <Pane name="top-points-pane" style={{ zIndex: 450 }}>
            {points.map((p) => (
              <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={10} pathOptions={{ color: STATUS_COLORS[p.status] || '#1e88e5', fillColor: STATUS_COLORS[p.status] || '#1e88e5', fillOpacity: 0.85 }}>
                <Popup minWidth={250}>
                  <div style={popupContainerStyle}>
                    
                    {editingPointId === p.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <input value={editData.address} onChange={(e) => setEditData({...editData, address: e.target.value})} style={popupInputStyle} />
                        <button onClick={async () => { await updateDoc(doc(db, 'CollectionPoints', p.id), editData); setEditingPointId(null); }} style={{ background: '#43a047', color: 'white', border: 'none', padding: '6px', borderRadius: '4px', fontWeight: 'bold' }}>שמור כתובת</button>
                      </div>
                    ) : (
                      <>
                        <strong style={{ fontSize: '15px', color: '#1a237e', display: 'block', marginBottom: '2px' }}>{p.address}</strong>
                        <div style={{ fontSize: '12px', color: '#555', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                          📋 סוג: {p.issueDescription || 'פינוי סדיר'}
                        </div>

                        {/* סרגל עדכון סטטוסים מעוצב */}
                        <label style={popupLabelStyle}>🔄 עדכן מצב מכולה (מוקד):</label>
                        <div style={statusGridStyle}>
                          <button onClick={() => handleStatusChange(p.id, 'BLUE')} style={statusBtnStyle('#1976d2', p.status === 'BLUE' || !p.status)}>🔵 חדש</button>
                          <button onClick={() => handleStatusChange(p.id, 'RED')} style={statusBtnStyle('#e53935', p.status === 'RED')}>🚨 מלא</button>
                          <button onClick={() => handleStatusChange(p.id, 'YELLOW')} style={statusBtnStyle('#fb8c00', p.status === 'YELLOW')}>⏳ טיפול</button>
                          <button onClick={() => handleStatusChange(p.id, 'GREEN')} style={statusBtnStyle('#43a047', p.status === 'GREEN')}>✅ פונה</button>
                        </div>

                        {/* קוביות תיעוד תמונות לפני ואחרי */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                          
                          <div style={photoBoxStyle}>
                            <div style={photoTitleStyle('#e65100')}>📸 לפני הפינוי</div>
                            {p.imageUrlBefore || p.imageUrl ? (
                              <a href={p.imageUrlBefore || p.imageUrl} target="_blank" rel="noreferrer">
                                <img src={p.imageUrlBefore || p.imageUrl} alt="לפני" style={imgPreviewStyle} />
                              </a>
                            ) : (
                              <div style={emptyPhotoPlaceholderStyle}>אין תמונה</div>
                            )}
                          </div>

                          <div style={photoBoxStyle}>
                            <div style={photoTitleStyle('#2e7d32')}>📸 אחרי הפינוי</div>
                            {p.imageUrlAfter ? (
                              <a href={p.imageUrlAfter} target="_blank" rel="noreferrer">
                                <img src={p.imageUrlAfter} alt="אחרי" style={imgPreviewStyle} />
                              </a>
                            ) : (
                              <div style={emptyPhotoPlaceholderStyle}>אין תמונה</div>
                            )}
                          </div>
                        </div>

                        {/* לחצן ניקוי תמונות */}
                        {(p.imageUrlBefore || p.imageUrl || p.imageUrlAfter) && (
                          <button onClick={() => handleClearPhotos(p.id)} style={btnClearPhotosStyle}>
                            🖼️ נקה קבצי תמונות מהמכולה
                          </button>
                        )}

                        <div style={{ display: 'flex', gap: '6px', marginTop: '12px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                          <button onClick={() => { setEditingPointId(p.id); setEditData({ address: p.address, contactName: p.contactName || '', phone: p.phone || '' }); }} style={btnEditStyle}>✏️ ערוך כתובת</button>
                          <button onClick={() => handleDelete(p.id)} style={btnDeleteStyle}>🗑️ מחק נקודה</button>
                        </div>
                      </>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </Pane>
        </MapContainer>

        {/* לוח הניהול הראשי */}
        <div style={panelStyle}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '15px', color: '#1a237e', borderBottom: '2px solid #e0e0e0', paddingBottom: '6px', textAlign: 'center' }}>לוח בקרת מפקח</div>
          
          <div style={sectionHeaderStyle}>סינון לפי נהג איסוף</div>
          <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={dropdownStyle}>
            <option value="ALL">🌍 כל הנהגים</option>
            <option value="נהג 1">🚚 נהג 1</option>
            <option value="נהג 2">🚚 נהג 2</option>
            <option value="נהג 3">🚚 נהג 3</option>
          </select>
          
          <div style={{ ...sectionHeaderStyle, marginTop: '12px' }}>נקודות איסוף</div>
          <button onClick={() => setShowForm(!showForm)} style={panelButtonStyle('#1976d2')}>{showForm ? '✖ סגור טופס הוספה' : '➕ הוסף נקודה ידנית'}</button>
          
          <div style={{ ...sectionHeaderStyle, marginTop: '12px' }}>ניהול גזרות</div>
          {drawingMode === null ? (
            <button onClick={() => { setDrawingMode('polygon'); setTempCoords([]); }} style={panelButtonStyle('#2e7d32')}>📐 הגדרת גזרה חדשה</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', color: '#333', backgroundColor: '#fff3cd', padding: '6px', borderRadius: '4px', border: '1px solid #ffeeba', lineHeight: '1.4' }}>קליק על המפה לבניית פוליגון.</div>
              {tempCoords.length >= 3 && <button onClick={savePolygonZone} style={panelButtonStyle('#2e7d32')}>✅ שמור אזור ({tempCoords.length} נק')</button>}
              <button onClick={() => { setDrawingMode(null); setTempCoords([]); }} style={panelButtonStyle('#666')}>❌ ביטול ציור</button>
            </div>
          )}
        </div>
      </div>

      {showForm && <AddPointForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

// עיצובים
const sectionHeaderStyle = { fontSize: '12px', fontWeight: 'bold', color: '#555', marginBottom: '4px', marginTop: '6px' };
const dropdownStyle = { width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px', backgroundColor: '#f8f9fa', color: '#333', cursor: 'pointer', direction: 'rtl' };
const panelStyle = { position: 'absolute', top: '20px', left: '20px', zIndex: 1000, background: 'white', padding: '14px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '4px', width: '220px', maxHeight: '90vh', overflowY: 'auto', direction: 'rtl', textAlign: 'right', boxSizing: 'border-box' };
const panelButtonStyle = (color) => ({ background: color, color: 'white', border: 'none', padding: '9px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', width: '100%' });
const sidebarStyle = { width: '340px', height: '100%', background: '#ffffff', boxShadow: '-2px 0 15px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', zIndex: 1050, boxSizing: 'border-box', padding: '16px' };
const sidebarTitleStyle = { margin: 0, fontSize: '16px', color: '#1a237e', fontWeight: 'bold' };
const sidebarSubStyle = { margin: '3px 0 0 0', fontSize: '11px', color: '#666' };
const dividerStyle = { border: 'none', borderTop: '1px solid #e0e0e0', margin: '10px 0' };
const sidebarListContainerStyle = { flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' };
const emptyStateStyle = { textAlign: 'center', color: '#888', fontSize: '12px', padding: '24px 10px', background: '#f9f9f9', borderRadius: '8px', border: '1px dashed #ccc' };
const reportCardStyle = { background: '#f5f7fa', border: '1px solid #e0e4ec', borderRadius: '8px', padding: '10px' };
const sidebarImageStyle = { width: '100%', maxHeight: '90px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd', marginTop: '4px', marginBottom: '4px' };
const btnApproveStyle = { background: '#2e7d32', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };
const btnRejectStyle = { background: '#c62828', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };
const popupContainerStyle = { minWidth: '240px', direction: 'rtl', textAlign: 'right', fontFamily: 'sans-serif' };
const popupInputStyle = { padding: '5px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '12px', width: '100%', boxSizing: 'border-box' };
const popupLabelStyle = { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#333' };
const statusGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px', marginBottom: '10px' };
const statusBtnStyle = (color, active) => ({ background: active ? color : '#f5f5f5', color: active ? 'white' : '#555', border: active ? 'none' : '1px solid #ccc', padding: '8px 0', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' });
const photoBoxStyle = { background: '#f9f9f9', border: '1px solid #e0e0e0', padding: '5px', borderRadius: '6px', boxSizing: 'border-box', textAlign: 'center' };
const photoTitleStyle = (color) => ({ fontSize: '11px', fontWeight: 'bold', color: color, marginBottom: '4px', textAlign: 'right' });
const imgPreviewStyle = { width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ddd' };
const emptyPhotoPlaceholderStyle = { height: '80px', background: '#eaeaea', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#777', border: '1px dashed #ccc' };
const btnClearPhotosStyle = { width: '100%', padding: '7px', background: '#37474f', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginTop: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' };
const btnEditStyle = { background: '#fb8c00', color: 'white', border: 'none', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', flex: 1 };
const btnDeleteStyle = { background: '#e53935', color: 'white', border: 'none', padding: '5px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', flex: 1 };