import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MapView from './MapView';
import DriverView from './DriverView';

// קומפוננטה זמנית עבור דף דיווח האזרח (כדי שהקוד יתקמפל בהצלחה)
// ברגע שתבנה את קובץ הדיווח האמיתי, תוכל לייבא אותו כאן במקום הפלייסהולדר.
function CitizenReportPlaceholder() {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: 'sans-serif', direction: 'rtl', background: '#f5f5f5', height: '100vh' }}>
      <div style={{ background: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'inline-block', maxWidth: '400px', width: '100%' }}>
        <h2>📢 טופס דיווח מפגעים (אזרח)</h2>
        <p style={{ color: '#666', marginTop: '10px' }}>מערכת הדיווח הציבורית תוטמע כאן בשלב הבא.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 1. מסך מפקח ראשי (לוח הבקרה והמפה המאוחדת) */}
        <Route path="/" element={<MapView />} />

        {/* 2. מסך נהג איסוף (ממשק מותאם לנייד + סינון גזרות וצילום תמונות) */}
        <Route path="/driver" element={<DriverView />} />

        {/* 3. מסך דיווח אזרח */}
        <Route path="/report" element={<CitizenReportPlaceholder />} />

        {/* 4. הגנת ניתוב (Fallback) - כל כתובת שגויה או לא מוכרת תחזיר אוטומטית לדף הבית */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}