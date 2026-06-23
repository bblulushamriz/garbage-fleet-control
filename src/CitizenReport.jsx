import { useState, useEffect } from 'react';
import { db, storage } from './firebase'; // הוספנו את ה-storage של התמונות
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // פונקציות להעלאת קבצים

export default function CitizenReport() {
  const [formData, setFormData] = useState({ address: '', contactName: '', phone: '', issueDescription: 'פינוי מכולה' });
  const [suggestions, setSuggestions] = useState([]);
  const [imageFile, setImageFile] = useState(null); // סטייט חדש לתמונה שהאזרח מצלם
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // מנוע חיפוש הכתובות המצוין שלך
  const fetchSuggestions = async (query) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=il&limit=5&accept-language=he`
      );
      const data = await response.json();
      setSuggestions(data);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (formData.address && !suggestions.find(s => s.display_name === formData.address)) {
        fetchSuggestions(formData.address);
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [formData.address]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. חילוץ קואורדינטות לפי הכתובת שנבחרה
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address)}&limit=1&accept-language=he`
      );
      const data = await response.json();
      const lat = data[0]?.lat || 32.0853;
      const lon = data[0]?.lon || 34.7818;

      // 2. העלאת התמונה ל-Storage במידה והאזרח צילם מפגע
      let imageUrl = '';
      if (imageFile) {
        const fileRef = ref(storage, `citizen_reports/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        imageUrl = await getDownloadURL(fileRef);
      }

      // 3. שמירה באוסף ההמתנה של הבקר (PendingReports) ולא ישירות במפה!
      await addDoc(collection(db, 'PendingReports'), {
        address: formData.address,
        contactName: formData.contactName || 'אזרח אנונימי',
        phone: formData.phone || 'לא הושאר טלפון',
        issueDescription: formData.issueDescription,
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        status: 'BLUE', // סטטוס כחול כברירת מחדל לנקודה חדשה
        imageUrl: imageUrl, // כתובת התמונה בענן
        createdAt: new Date()
      });

      setSubmitted(true);
    } catch (error) {
      console.error(error);
      alert('שגיאה בשליחת הדיווח');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif', direction: 'rtl', padding: '20px' }}>
        <div style={{ fontSize: '50px', marginBottom: '10px' }}>✅</div>
        <h2 style={{ color: '#2e7d32' }}>תודה! הדיווח התקבל בהצלחה.</h2>
        <p style={{ color: '#555' }}>הדיווח הועבר לבדיקת מפקח הבקרה ויעודכן במערכת בהקדם.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', direction: 'rtl', maxWidth: '420px', margin: 'auto', fontFamily: 'sans-serif', boxSizing: 'border-box' }}>
      <h1 style={{ color: '#1a237e', fontSize: '24px', marginBottom: '8px' }}>📢 דיווח על מפגע / מכולה מלאה</h1>
      <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>עזור לנו לשמור על סביבה נקייה. מלא את פרטי המפגע והמידע יועבר לטיפול מיידי.</p>
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        {/* שדה כתובת חכם עם השלמה אוטומטית */}
        <div style={{ position: 'relative' }}>
          <label style={labelStyle}>📍 מיקום או כתובת המפגע *</label>
          <input 
            placeholder="הקלד רחוב ומספר עיר..." 
            required 
            style={inputStyle} 
            value={formData.address} 
            onChange={(e) => setFormData({...formData, address: e.target.value})} 
          />
          
          {suggestions.length > 0 && (
            <ul style={suggestionsStyle}>
              {suggestions.map((s, index) => (
                <li key={index} style={suggestionItemStyle} onClick={() => {
                  setFormData({...formData, address: s.display_name});
                  setSuggestions([]);
                }}>
                  {s.display_name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* מהות המפגע */}
        <div>
          <label style={labelStyle}>📝 מהות המפגע</label>
          <select 
            style={inputStyle} 
            value={formData.issueDescription} 
            onChange={(e) => setFormData({...formData, issueDescription: e.target.value})}
          >
            <option value="פינוי מכולה">פינוי מכולה מלאה</option>
            <option value="אשפה מחוץ למכולה">אשפה זרוקה מחוץ למכולה</option>
            <option value="מכולה שבורה / פגומה">מכולה שבורה / פגומה</option>
            <option value="חסימת גישה למכולה">רכב חוסם גישה למכולה</option>
            <option value="אחר">מפגע אחר</option>
          </select>
        </div>

        {/* שם וטלפון */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={labelStyle}>👤 שם מלא (רשות)</label>
            <input placeholder="ישראל ישראלי" style={inputStyle} onChange={(e) => setFormData({...formData, contactName: e.target.value})} />
          </div>
          <div>
            <label style={labelStyle}>📞 טלפון (רשות)</label>
            <input placeholder="050-1234567" type="tel" style={inputStyle} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
          </div>
        </div>

        {/* רכיב צילום תמונה מובנה מהנייד */}
        <div>
          <label style={labelStyle}>📸 צרף תמונת מצב מהשטח</label>
          <label style={fileLabelStyle(imageFile !== null)}>
            {imageFile ? `📎 קובץ נבחר: ${imageFile.name.substring(0, 15)}...` : '📷 לחץ כאן כדי לצלם את המפגע'}
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              onChange={(e) => setImageFile(e.target.files[0])} 
              style={{ display: 'none' }}
            />
          </label>
        </div>
        
        <button type="submit" disabled={loading} style={buttonStyle(loading)}>
          {loading ? '🔄 שולח ומעלה קבצים...' : '🚀 שלח דיווח למערכת'}
        </button>
      </form>
    </div>
  );
}

// עיצובים
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: '#333' };
const inputStyle = { padding: '12px', borderRadius: 8, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fafafa' };
const buttonStyle = (loading) => ({ padding: '14px', background: loading ? '#9e9e9e' : '#1a237e', color: 'white', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', fontSize: '16px', fontWeight: 'bold', marginTop: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' });
const fileLabelStyle = (active) => ({ display: 'block', textAlign: 'center', background: active ? '#e8f5e9' : '#f0f4f8', color: active ? '#2e7d32' : '#1a73e8', padding: '12px', borderRadius: '8px', border: active ? '2px solid #2e7d32' : '2px dashed #1a73e8', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' });

const suggestionsStyle = { 
  position: 'absolute', top: '100%', left: 0, right: 0, background: '#ffffff', border: '1px solid #ccc', borderTop: 'none',
  listStyle: 'none', padding: 0, margin: 0, zIndex: 9999, maxHeight: '180px', overflowY: 'auto',
  boxShadow: '0 4px 10px rgba(0,0,0,0.15)', borderRadius: '0 0 8px 8px'
};
const suggestionItemStyle = { padding: '11px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '13px', color: '#333', textAlign: 'right' };