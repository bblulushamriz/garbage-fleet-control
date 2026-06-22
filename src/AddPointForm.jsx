import { useState } from 'react';
import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

export default function AddPointForm({ onClose }) {
  const [formData, setFormData] = useState({ address: '', contactName: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. קריאה ל-Geocoding כדי להמיר כתובת לקואורדינטות
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address)}`
      );
      const data = await response.json();

      if (data.length === 0) {
        alert('לא נמצאה כתובת, אנא נסה כתובת מדויקת יותר');
        setLoading(false);
        return;
      }

      const { lat, lon } = data[0];

      // 2. שמירה ב-Firebase
      await addDoc(collection(db, 'CollectionPoints'), {
        address: formData.address,
        contactName: formData.contactName,
        phone: formData.phone,
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        status: 'GREY', // סטטוס התחלתי
        createdAt: new Date()
      });

      alert('הנקודה נוספה בהצלחה!');
      onClose(); // סגירת הטופס
    } catch (error) {
      console.error('Error adding document: ', error);
      alert('שגיאה בשמירת הנקודה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: 70, right: 20, zIndex: 1000,
      background: 'white', padding: '20px', borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)', width: '300px', direction: 'rtl'
    }}>
      <h3 style={{ marginTop: 0 }}>הוספת נקודת איסוף</h3>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input placeholder="כתובת" required value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} style={inputStyle} />
        <input placeholder="שם איש קשר" required value={formData.contactName} onChange={(e) => setFormData({...formData, contactName: e.target.value})} style={inputStyle} />
        <input placeholder="טלפון" required value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} style={inputStyle} />
        
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'מטפל...' : 'שמור נקודה'}
        </button>
        <button type="button" onClick={onClose} style={{ ...buttonStyle, background: '#757575' }}>ביטול</button>
      </form>
    </div>
  );
}

const inputStyle = { padding: '8px', borderRadius: 4, border: '1px solid #ccc' };
const buttonStyle = { padding: '10px', background: '#1976d2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' };