import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { db } from './firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// פונקציית עזר ליצירת נעצים צבעוניים על המפה לפי סטטוס המכולה
const createCustomIcon = (status) => {
  const colors = { 
    RED: '#e53935',    // מלא / דחוף
    YELLOW: '#fb8c00', // בטיפול
    GREEN: '#43a047',  // פונה וריק
    BLUE: '#1976d2'    // דיווח אזרח חדש שאושר
  };
  const color = colors[status] || '#1976d2';
  
  return L.divIcon({
    html: `<div style="
      background-color: ${color}; 
      width: 16px; 
      height: 16px; 
      border-radius: 50%; 
      border: 2px solid white; 
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    "></div>`,
    className: 'custom-leaflet-pin',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

// רכיב פנימי לעדכון מרכז המפה בצורה חלקה בעת לחיצה על דיווח מהתפריט
function MapCenterController({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 16, { animate: true });
    }
  }, [center, map]);
  return null;
}

export default function MapView() {
  const [points, setPoints] = useState([]);
  const [pendingReports, setPendingReports] = useState([]);
  const [mapCenter, setMapCenter] = useState([32.0853, 34.7818]); // ברירת מחדל: מרכז הארץ

  // 1. האזנה בזמן אמת לנקודות האיסוף הפעילות על המפה
  useEffect(() => {
    const unsubPoints = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPoints(data);
    });
    return () => unsubPoints();
  }, []);

  // 2. האזנה בזמן אמת לתור דיווחי האזרחים הממתינים לאישור (Moderation Queue)
  useEffect(() => {
    const unsubPending = onSnapshot(collection(db, 'PendingReports'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingReports(data);
    });
    return () => unsubPending();
  }, []);

  // שינוי סטטוס מכולה מתוך בלון המפה
  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateDoc(doc(db, 'CollectionPoints', id), { status: newStatus });
    } catch (e) {
      console.error("Error updating status:", e);
    }
  };

  // כפתור מפקח מהיר: פינוי מכולה ואיפוס ידני
  const handleClearBin = async (id) => {
    try {
      await updateDoc(doc(db, 'CollectionPoints', id), {
        status: 'GREEN',
        imageUrlBefore: '', // מאפס תמונות ישנות במידת הצורך
        imageUrlAfter: '',
        imageUrl: '' 
      });
      alert('המכולה עודכנה כפונתה ונקייה!');
    } catch (e) {
      console.error("Error clearing bin:", e);
    }
  };

  // אישור דיווח תושב והפיכתו למשימה רשמית על המפה (סטטוס כחול)
  const handleApproveReport = async (report) => {
    try {
      await addDoc(collection(db, 'CollectionPoints'), {
        address: report.address,
        lat: parseFloat(report.lat),
        lng: parseFloat(report.lng),
        issueDescription: report.issueDescription || 'דיווח תושב',
        imageUrlBefore: report.imageUrl || '', // התמונה שהתושב צילם נכנסת כ"לפני"
        status: 'BLUE',
        createdAt: new Date().toISOString()
      });
      // מחיקה מתור ההמתנה
      await deleteDoc(doc(db, 'PendingReports', report.id));
    } catch (e) {
      console.error("Error approving report:", e);
    }
  };

  // דחיית דיווח תושב ומחיקתו מהתור
  const handleRejectReport = async (id) => {
    if (window.confirm("האם אתה בטוח שברצונך למחוק דיווח זה?")) {
      try {
        await deleteDoc(doc(db, 'PendingReports', id));
      } catch (e) {
        console.error("Error rejecting report:", e);
      }
    }
  };

  return (
    <div style={pageContainerStyle}>
      
      {/* לוח צדדי: ניהול דיווחי אזרחים נכנסים */}
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
                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#1a237e', marginBottom: '4px' }}>
                  📍 {report.address}
                </div>
                <div style={{ fontSize: '13px', color: '#333', marginBottom: '6px' }}>
                  <strong>תיאור:</strong> {report.issueDescription || 'לא צוין פירוט'}
                </div>
                
                {report.imageUrl && (
                  <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                    <img src={report.imageUrl} alt="מפגע תושב" style={sidebarImageStyle} />
                  </div>
                )}
                
                <div style={cardActionGridStyle}>
                  <button onClick={() => { setMapCenter([report.lat, report.lng]); }} style={btnViewStyle}>👁️ מיקום</button>
                  <button onClick={() => handleApproveReport(report)} style={btnApproveStyle}>✅ אשרו משימה</button>
                  <button onClick={() => handleRejectReport(report.id)} style={btnRejectStyle}>🗑️ דחה</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* מפת השליטה והבקרה בגודל מלא */}
      <div style={mapWrapperStyle}>
        <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapCenterController center={mapCenter} />

          {/* רינדור נקודות המשימה הפעילות על המפה */}
          {points.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={createCustomIcon(p.status)}>
              <Popup>
                <div style={popupContainerStyle}>
                  <h3 style={popupTitleStyle}>{p.address}</h3>
                  <div style={popupDescStyle}>📋 תיאור: {p.issueDescription || 'פינוי סדיר'}</div>
                  
                  {/* 📸 מערכת הצגת תמונות הצימוד: לפני ואחרי (שלב 2 החדש) */}
                  {(p.imageUrlBefore || p.imageUrl || p.imageUrlAfter) && (
                    <div style={imagesGridStyle((p.imageUrlBefore || p.imageUrl) && p.imageUrlAfter)}>
                      
                      {/* תמונת לפני (או תמונת מקור של אזרח/מערכת ישנה) */}
                      {(p.imageUrlBefore || p.imageUrl) && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={imageLabelStyle('#e65100')}>◀ לפני הפינוי</div>
                          <a href={p.imageUrlBefore || p.imageUrl} target="_blank" rel="noreferrer">
                            <img src={p.imageUrlBefore || p.imageUrl} alt="לפני" style={popupImageStyle} />
                          </a>
                        </div>
                      )}

                      {/* תמונת אחרי שהועלתה מהשטח על ידי הנהג */}
                      {p.imageUrlAfter && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={imageLabelStyle('#2e7d32')}>◀ אחרי הפינוי</div>
                          <a href={p.imageUrlAfter} target="_blank" rel="noreferrer">
                            <img src={p.imageUrlAfter} alt="אחרי" style={popupImageStyle} />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* שינוי סטטוס מהיר מהמפה */}
                  <div style={{ marginTop: '10px' }}>
                    <div style={popupSelectLabelStyle}>שינוי סטטוס ידני:</div>
                    <select 
                      value={p.status} 
                      onChange={(e) => handleStatusChange(p.id, e.target.value)}
                      style={popupSelectStyle(p.status)}
                    >
                      <option value="BLUE">🔵 חדש / מאושר</option>
                      <option value="YELLOW">⏳ בטיפול צוות</option>
                      <option value="RED">🚨 דחוף / מלא</option>
                      <option value="GREEN">✅ פונה וריק</option>
                    </select>
                  </div>

                  {/* כפתור ניקוי מהיר ואיפוס מכולה */}
                  {p.status !== 'GREEN' && (
                    <button onClick={() => handleClearBin(p.id)} style={btnClearBinStyle}>
                      🧹 סמן כפונה ורוקן פח
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

    </div>
  );
}

// ============== מערכת עיצובים קשיחה ומבוטחת צבעים (CSS-in-JS) ==============
const pageContainerStyle = { display: 'flex', width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', direction: 'rtl', fontFamily: 'system-ui, sans-serif' };
const mapWrapperStyle = { flexGrow: 1, height: '100%', position: 'relative' };

// עיצוב סיידבר מודרציה
const sidebarStyle = { width: '360px', height: '100%', background: '#ffffff', boxShadow: '-2px 0 15px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', zIndex: 1050, boxSizing: 'border-box', padding: '16px' };
const sidebarTitleStyle = { margin: 0, fontSize: '18px', color: '#1a237e', fontWeight: 'bold' };
const sidebarSubStyle = { margin: '4px 0 0 0', fontSize: '12px', color: '#666' };
const dividerStyle = { border: 'none', borderTop: '1px solid #e0e0e0', margin: '12px 0' };
const sidebarListContainerStyle = { flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingLeft: '4px' };
const emptyStateStyle = { textAlign: 'center', color: '#888', fontSize: '13px', padding: '30px 10px', background: '#f9f9f9', borderRadius: '8px', border: '1px dashed #ccc' };

// כרטיסיית דיווח בסיידבר
const reportCardStyle = { background: '#f5f7fa', border: '1px solid #e0e4ec', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' };
const sidebarImageStyle = { width: '100%', maxHeight: '110px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ddd', marginTop: '4px' };
const cardActionGridStyle = { display: 'grid', gridTemplateColumns: '1fr 1.3fr 0.8fr', gap: '6px', marginTop: '6px' };

// כפתורי סיידבר
const btnViewStyle = { background: '#ffffff', color: '#1976d2', border: '1px solid #1976d2', borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };
const btnApproveStyle = { background: '#2e7d32', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };
const btnRejectStyle = { background: '#c62828', color: '#ffffff', border: 'none', borderRadius: '4px', padding: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' };

// עיצובי פופאפ (Popup) על המפה
const popupContainerStyle = { minWidth: '220px', direction: 'rtl', textAlign: 'right', color: '#222' };
const popupTitleStyle = { margin: '0 0 4px 0', fontSize: '14px', color: '#1a237e', fontWeight: 'bold' };
const popupDescStyle = { fontSize: '12px', color: '#444', marginBottom: '8px' };

// גריד חכם לתצוגת תמונות הצימוד
const imagesGridStyle = (showDual) => ({ display: 'grid', gridTemplateColumns: showDual ? '1fr 1fr' : '1fr', gap: '8px', marginTop: '8px', marginBottom: '8px' });
const imageLabelStyle = (color) => ({ fontSize: '10px', fontWeight: 'bold', color: color, marginBottom: '2px' });
const popupImageStyle = { width: '100%', height: '75px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #bbb' };

const popupSelectLabelStyle = { fontSize: '11px', fontWeight: 'bold', color: '#555', marginBottom: '3px' };
const popupSelectStyle = (status) => {
  const bgColors = { RED: '#ffcdd2', YELLOW: '#ffe0b2', GREEN: '#c8e6c9', BLUE: '#bbdefb' };
  return { width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #aaa', fontSize: '12px', fontWeight: 'bold', background: bgColors[status] || '#fff', color: '#222', cursor: 'pointer' };
};

const btnClearBinStyle = { background: '#43a047', color: 'white', width: '100%', padding: '8px', border: 'none', borderRadius: '6px', marginTop: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };