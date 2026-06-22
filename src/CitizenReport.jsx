import { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc } from 'firebase/firestore';

export default function CitizenReport() {
  const [formData, setFormData] = useState({ address: '', contactName: '', phone: '', issueDescription: '' });
  const [suggestions, setSuggestions] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

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
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address)}&limit=1&accept-language=he`
      );
      const data = await response.json();
      const lat = data[0]?.lat || 32.0853;
      const lon = data[0]?.lon || 34.7818;

      await addDoc(collection(db, 'CollectionPoints'), {
        ...formData,
        lat: parseFloat(lat),
        lng: parseFloat(lon),
        status: 'GREY',
        createdAt: new Date()
      });
      setSubmitted(true);
    } catch (error) {
      alert('שגיאה בשליחת הדיווח');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) return <div style={{textAlign: 'center', marginTop: '50px', fontFamily: 'sans-serif', direction: 'rtl'}}>תודה! הדיווח התקבל בהצלחה.</div>;

  return (
    <div style={{ padding: '20px', direction: 'rtl', maxWidth: '400px', margin: 'auto', fontFamily: 'sans-serif' }}>
      <h1>דיווח על מפגע</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        
        {/* מיכל עם position relative כדי שההצעות יתייחסו אליו */}
        <div style={{ position: 'relative' }}>
          <input 
            placeholder="הקלד כתובת..." 
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

        <input placeholder="שם מלא" required style={inputStyle} onChange={(e) => setFormData({...formData, contactName: e.target.value})} />
        <input placeholder="טלפון" type="tel" required style={inputStyle} onChange={(e) => setFormData({...formData, phone: e.target.value})} />
        <textarea placeholder="תיאור המפגע" style={inputStyle} onChange={(e) => setFormData({...formData, issueDescription: e.target.value})} />
        
        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'שולח...' : 'שלח דיווח'}
        </button>
      </form>
    </div>
  );
}

const inputStyle = { padding: '12px', borderRadius: 8, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' };
const buttonStyle = { padding: '12px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '16px' };

// עיצוב ההצעות הצף
const suggestionsStyle = { 
  position: 'absolute', 
  top: '100%', 
  left: 0, 
  right: 0, 
  background: '#ffffff', 
  border: '1px solid #ccc', 
  borderTop: 'none',
  listStyle: 'none', 
  padding: 0, 
  margin: 0, 
  zIndex: 9999, 
  maxHeight: '200px', 
  overflowY: 'auto',
  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
  borderRadius: '0 0 8px 8px'
};

const suggestionItemStyle = { padding: '12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '14px', color: '#333' };