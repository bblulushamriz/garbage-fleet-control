import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MapView from './MapView';
import DriverView from './DriverView';
import CitizenReport from './CitizenReport'; // <-- ייבוא קובץ הדיווח האמיתי והמעודכן

export default function App() {
  return (
    <Router>
      <Routes>
        {/* 1. מסך מפקח ראשי (לוח הבקרה והמפה המאוחדת) */}
        <Route path="/" element={<MapView />} />

        {/* 2. מסך נהג איסוף (ממשק מותאם לנייד + סינון גזרות וצילום תמונות) */}
        <Route path="/driver" element={<DriverView />} />

        {/* 3. מסך דיווח אזרח חכם (עם השלמה אוטומטית, צילום תמונה ותור המתנה לבקר) */}
        <Route path="/report" element={<CitizenReport />} />

        {/* 4. הגנת ניתוב (Fallback) - כל כתובת שגויה או לא מוכרת תחזיר אוטומטית לדף הבית */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}