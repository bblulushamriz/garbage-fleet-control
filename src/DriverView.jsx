import { useEffect, useState } from 'react';
import { db, storage } from './firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function DriverView() {
  const [points, setPoints] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState('נהג 1');
  const [expandedPointId, setExpandedPointId] = useState(null);
  const [loadingMap, setLoadingMap] = useState({}); // מעקב חכם אחרי סטטוס טעינה של כל כפתור בנפרד

  // האזנה חיה לכל נקודות האיסוף במערכת
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'CollectionPoints'), (snapshot) => {
      setPoints(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // פונקציה להעלאת תמונות מהשטח (לפני או אחרי) ועדכון השדה המתאים בבסיס הנתונים
  const handlePhotoUpload = async (pointId, file, type) => {
    if (!file) return;

    // יצירת מפתח ייחודי לעדכון חיווי הטעינה (למשל: pointId_before)
    const loadKey = `${pointId}_${type}`;
    setLoadingMap((prev) => ({ ...prev, [loadKey]: true }));

    try {
      // 1. העלאת הקובץ ל-Storage תחת תיקיית driver_reports
      const fileRef = ref(storage, `driver_reports/${pointId}_${type}_${Date.now()}`);
      await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(fileRef);

      // 2. קביעת השדה לעדכון ב-Firestore לפי סוג הצילום
      const fieldToUpdate = type === 'before' ? 'imageUrlBefore' : 'imageUrlAfter';

      await updateDoc(doc(db, 'CollectionPoints', pointId), {
        [fieldToUpdate]: downloadUrl
      });

      alert(`תמונת "${type === 'before' ? 'לפני הפינוי' : 'אחרי הפינוי'}" הועלתה בהצלחה!`);
    } catch (error) {
      console.error("Error uploading photo:", error);
      alert("שגיאה בהעלאת התמונה. ודא שחוקי ה-Storage פתוחים.");
    } finally {
      setLoadingMap((prev) => ({ ...prev, [loadKey]: false }));
    }
  };

  // עדכון סטטוס המכולה (מלא / בטיפול / פונה)
  const handleStatusChange = async (pointId, newStatus) => {
    try {
      await updateDoc(doc(db, 'CollectionPoints', pointId), { status: newStatus });
    } catch (e) {
      console.error(e);
    }
  };

  // 🔍 סינון נקודות האיסוף: מציג רק נקודות שמשויכות לנהג הנבחר (או נקודות כלליות ללא שיוך)
  const filteredPoints = points.filter(
    (p) => p.driver === selectedDriver || !p.driver
  );

  return (
    <div style={containerStyle}>
      {/* כותרת ובחירת נהג */}
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>🚚 ממשק עבודה - צוותי שטח</h2>
        <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)} style={driverSelectStyle}>
          <option value="נהג 1">צוות איסוף 1 (נהג 1)</option>
          <option value="נהג 2">צוות איסוף 2 (נהג 2)</option>
          <option value="נהג 3">צוות איסוף 3 (נהג 3)</option>
        </select>
      </div>

      {/* רשימת המשימות המסוננת */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
        {filteredPoints.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#666', padding: '20px', background: 'white', borderRadius: '8px' }}>
            אין מכולות משויכות לצוות זה כעת. 👍
          </div>
        ) : (
          filteredPoints.map((p) => {
            const isExpanded = expandedPointId === p.id;
            return (
              <div key={p.id} style={cardStyle(p.status)}>
                {/* חלק עליון של הכרטיס (תמיד גלוי) */}
                <div onClick={() => setExpandedPointId(isExpanded ? null : p.id)} style={cardHeaderStyle}>
                  <div>
                    <strong style={{ fontSize: '14px', color: '#222' }}>{p.address}</strong>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>📋 סוג: {p.issueDescription || 'פינוי סדיר'}</div>
                  </div>
                  <div style={badgeStyle(p.status)}>
                    {p.status === 'RED' ? '🚨 מלא' : p.status === 'YELLOW' ? '⏳ בטיפול' : p.status === 'GREEN' ? '✅ פונה' : '🔵 חדש'}
                  </div>
                </div>

                {/* חלק תחתון נפתח - ניהול המשימה ותיעוד התמונות */}
                {isExpanded && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                    
                    {/* סרגל עדכון סטטוסים למכולה */}
                    <label style={labelStyle}>עדכן מצב מכולה מהשטח:</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                      <button onClick={() => handleStatusChange(p.id, 'RED')} style={statusButtonStyle('#e53935', p.status === 'RED')}>🚨 מלא</button>
                      <button onClick={() => handleStatusChange(p.id, 'YELLOW')} style={statusButtonStyle('#fb8c00', p.status === 'YELLOW')}>⏳ בטיפול</button>
                      <button onClick={() => handleStatusChange(p.id, 'GREEN')} style={statusButtonStyle('#43a047', p.status === 'GREEN')}>✅ פונה</button>
                    </div>

                    {/* 📸 שדה א': צילום תמונה לפני הפינוי */}
                    <div style={photoSectionStyle}>
                      <span style={photoTitleStyle('#e65100')}>📸 שלב א': תמונה לפני הפינוי</span>
                      {(p.imageUrlBefore || p.imageUrl) && (
                        <img src={p.imageUrlBefore || p.imageUrl} alt="לפני" style={previewImageStyle} />
                      )}
                      <label style={fileLabelStyle(loadingMap[`${p.id}_before`], '#fff3e0', '#e65100')}>
                        {loadingMap[`${p.id}_before`] ? '🔄 מעלה תמונת לפני...' : '📷 צלם מכולה מלאה (לפני)'}
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

                    {/* 📸 שדה ב': צילום תמונה אחרי הפינוי */}
                    <div style={photoSectionStyle}>
                      <span style={photoTitleStyle('#2e7d32')}>📸 שלב ב': תמונה אחרי הפינוי (מכולה ריקה)</span>
                      {p.imageUrlAfter && (
                        <img src={p.imageUrlAfter} alt="אחרי" style={previewImageStyle} />
                      )}
                      <label style={fileLabelStyle(loadingMap[`${p.id}_after`], '#e8f5e9', '#2e7d32')}>
                        {loadingMap[`${p.id}_after`] ? '🔄 מעלה תמונת אחרי...' : '📷 צלם מכולה נקייה (אחרי)'}
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

// ============== מערכת עיצובים קשיחה לרשימת מובייל ==============
const containerStyle = { padding: '12px', background: '#f4f6f9', minHeight: '100vh', fontFamily: 'sans-serif', direction: 'rtl', boxSizing: 'border-box' };
const headerStyle = { background: '#1a237e', color: 'white', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };
const driverSelectStyle = { width: '100%', padding: '8px', borderRadius: '4px', border: 'none', fontWeight: 'bold', background: 'white', color: '#1a237e', fontSize: '14px', outline: 'none' };

const cardStyle = (status) => {
  const colors = { RED: '#ffcdd2', YELLOW: '#ffe0b2', GREEN: '#c8e6c9', BLUE: '#bbdefb' };
  return { background: 'white', borderRadius: '8px', padding: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', borderRight: `6px solid ${colors[status] || '#ccc'}`, cursor: 'pointer', boxSizing: 'border-box' };
};
const cardHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const badgeStyle = (status) => {
  const colors = { RED: '#d32f2f', YELLOW: '#f57c00', GREEN: '#388e3c', BLUE: '#1976d2' };
  return { background: colors[status] || '#666', color: 'white', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' };
};

const labelStyle = { fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#333' };
const statusButtonStyle = (color, active) => ({ background: active ? color : '#f5f5f5', color: active ? 'white' : '#555', border: active ? 'none' : '1px solid #ccc', padding: '9px 2px', borderRadius: '5px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'center', outline: 'none' });

const photoSectionStyle = { background: '#fdfdfd', border: '1px solid #e5e5e5', padding: '8px', borderRadius: '6px', marginBottom: '10px', boxSizing: 'border-box' };
const photoTitleStyle = (color) => ({ fontSize: '12px', fontWeight: 'bold', color: color, display: 'block', marginBottom: '6px' });
const previewImageStyle = { width: '100%', maxHeight: '110px', objectFit: 'cover', borderRadius: '4px', marginBottom: '6px', border: '1px solid #ddd' };
const fileLabelStyle = (loading, bgColor, textColor) => ({ display: 'block', textAlign: 'center', background: loading ? '#e0e0e0' : bgColor, color: loading ? '#666' : textColor, padding: '10px', borderRadius: '5px', border: `1px dashed ${textColor}`, cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '12px', boxSizing: 'border-box' });