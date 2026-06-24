import { useEffect, useState } from 'react';
import { db, storage } from './firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function DriverView() {
  const [points, setPoints] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('נהג 1');
  const [expandedPointId, setExpandedPointId] = useState(null);
  const [loadingMap, setLoadingMap] = useState({}); // מעקב אחרי סטטוס העלאה לכל נקודה

  // טעינת כל הנקודות מה-Firestore
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPoints(data);
    });
    return () => unsub();
  }, []);

  // פונקציה חכמה להעלאת תמונה (לפני או אחרי) ישירות ל-Storage ועדכון ה-Firestore
  const handlePhotoUpload = async (pointId, file, type) => {
    if (!file) return;

    // הגדרת מפתח ייחודי בסטייט הטעינה (למשל: pointId_before)
    const loadKey = `${pointId}_${type}`;
    setLoadingMap(prev => ({ ...prev, [loadKey]: true }));

    try {
      // 1. העלאת הקובץ לתיקייה ייעודית בענן לפי סוג הצילום
      const fileRef = ref(storage, `driver_reports/${pointId}_${type}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      // 2. עדכון השדה המתאים ב-Firestore (imageUrlBefore או imageUrlAfter)
      const fieldToUpdate = type === 'before' ? 'imageUrlBefore' : 'imageUrlAfter';
      
      await updateDoc(doc(db, 'CollectionPoints', pointId), {
        [fieldToUpdate]: downloadUrl
      });

      alert(`תמונת "${type === 'before' ? 'לפני' : 'אחרי'}" הועלתה והתעדכנה בהצלחה!`);
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("שגיאה בהעלאת התמונה. ודא שחוקי ה-Storage פתוחים.");
    } finally {
      setLoadingMap(prev => ({ ...prev, [loadKey]: false }));
    }
  };

  // עדכון מהיר של סטטוס המכולה על ידי הנהג
  const handleStatusChange = async (pointId, newStatus) => {
    try {
      await updateDoc(doc(db, 'CollectionPoints', pointId), { status: newStatus });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={containerStyle}>
      {/* כותרת עליונה */}
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>🚚 ממשק נהג שטח</h2>
        <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={driverSelectStyle}>
          <option value="נהג 1">צוות איסוף 1 (נהג 1)</option>
          <option value="נהג 2">צוות איסוף 2 (נהג 2)</option>
          <option value="נהג 3">צוות איסוף 3 (נהג 3)</option>
        </select>
      </div>

      {/* רשימת המשימות של הנהג */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
        {points.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>טוען משימות מהמוקד העירוני...</div>
        ) : (
          points.map((p) => {
            const isExpanded = expandedPointId === p.id;
            return (
              <div key={p.id} style={cardStyle(p.status)}>
                {/* חלק עליון של הכרטיסייה (תמיד גלוי) */}
                <div onClick={() => setExpandedPointId(isExpanded ? null : p.id)} style={cardHeaderStyle}>
                  <div>
                    <strong style={{ fontSize: '15px', color: '#222' }}>{p.address}</strong>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>📋 מפגע: {p.issueDescription || 'פינוי רגיל'}</div>
                  </div>
                  <div style={badgeStyle(p.status)}>
                    {p.status === 'RED' ? '🚨 דחוף' : p.status === 'YELLOW' ? '⏳ בטיפול' : p.status === 'GREEN' ? '✅ פונה' : '🔵 חדש'}
                  </div>
                </div>

                {/* חלק תחתון של הכרטיסייה (נפתח בלחיצה) */}
                {isExpanded && (
                  <div style={cardBodyStyle}>
                    <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '10px 0' }} />
                    
                    {/* שליטה בסטטוס המשימה */}
                    <label style={labelStyle}>🔄 עדכן סטטוס מכולה מהשטח:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                      <button onClick={() => handleStatusChange(p.id, 'RED')} style={statusButtonStyle('#e53935', p.status === 'RED')}>🚨 מלא/דחוף</button>
                      <button onClick={() => handleStatusChange(p.id, 'YELLOW')} style={statusButtonStyle('#fb8c00', p.status === 'YELLOW')}>⏳ בטיפול</button>
                      <button onClick={() => handleStatusChange(p.id, 'GREEN')} style={statusButtonStyle('#43a047', p.status === 'GREEN')}>✅ פונה וריק</button>
                    </div>

                    {/* 📸 שדה 1: צילום תמונה ל-פני הפינוי */}
                    <div style={{ marginBottom: '14px', background: '#f9f9f9', padding: '10px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                      <label style={labelStyle}>📸 שלב א': תמונה לפני הפינוי *</label>
                      
                      {p.imageUrlBefore || p.imageUrl ? ( // גיבוי לשדה הישן במידה וקיים
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                          <img src={p.imageUrlBefore || p.imageUrl} alt="לפני" style={previewImageStyle} />
                        </div>
                      ) : null}

                      <label style={fileLabelStyle(loadingMap[`${p.id}_before`])}>
                        {loadingMap[`${p.id}_before`] ? '🔄 מעלה תמונת לפני...' : (p.imageUrlBefore || p.imageUrl ? '📷 החלף תמונת לפני' : '📷 צלם מכולה מלאה (לפני)')}
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

                    {/* 📸 שדה 2: צילום תמונה ל-אחרי הפינוי */}
                    <div style={{ background: '#f9f9f9', padding: '10px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
                      <label style={labelStyle}>📸 שלב ב': תמונה אחרי הפינוי (מכולה ריקה) *</label>
                      
                      {p.imageUrlAfter && (
                        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                          <img src={p.imageUrlAfter} alt="אחרי" style={previewImageStyle} />
                        </div>
                      )}

                      <label style={fileLabelStyle(loadingMap[`${p.id}_after`], true)}>
                        {loadingMap[`${p.id}_after`] ? '🔄 מעלה תמונת אחרי...' : (p.imageUrlAfter ? '📷 החלף תמונת אחרי' : '📷 צלם מכולה נקייה (אחרי)')}
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
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// עיצובים מותאמים מובייל (Mobile-First) עבור הנהגים בשטח בשעות יום
const containerStyle = { padding: '14px', background: '#f4f6f9', minHeight: '100vh', fontFamily: 'sans-serif', direction: 'rtl', boxSizing: 'border-box' };
const headerStyle = { background: '#1a237e', color: 'white', padding: '14px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' };
const driverSelectStyle = { width: '100%', padding: '8px', borderRadius: '6px', border: 'none', fontSize: '14px', fontWeight: 'bold', background: '#ffffff', color: '#1a237e' };
const cardStyle = (status) => {
  const colors = { RED: '#ffcdd2', YELLOW: '#ffe0b2', GREEN: '#c8e6c9', BLUE: '#bbdefb' };
  return { background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', borderRight: `6px solid ${colors[status] || '#bbdefb'}`, cursor: 'pointer', transition: 'all 0.2s ease-in-out' };
};
const cardHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const badgeStyle = (status) => {
  const colors = { RED: '#d32f2f', YELLOW: '#f57c00', GREEN: '#388e3c', BLUE: '#1976d2' };
  return { background: colors[status] || '#1976d2', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' };
};
const cardBodyStyle = { marginTop: '10px', textAlign: 'right' };
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '6px', color: '#444' };
const statusButtonStyle = (color, active) => ({ background: active ? color : '#f0f0f0', color: active ? 'white' : '#555', border: active ? 'none' : '1px solid #ccc', padding: '10px 4px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center' });
const previewImageStyle = { width: '100%', maxHeight: '140px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #ccc' };
const fileLabelStyle = (loading, isAfter = false) => ({ display: 'block', textAlign: 'center', background: loading ? '#e0e0e0' : (isAfter ? '#e8f5e9' : '#fff3e0'), color: loading ? '#666' : (isAfter ? '#2e7d32' : '#e65100'), padding: '12px', borderRadius: '8px', border: loading ? '1px solid #ccc' : (isAfter ? '2px dashed #2e7d32' : '2px dashed #e65100'), cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px', marginTop: '4px' });