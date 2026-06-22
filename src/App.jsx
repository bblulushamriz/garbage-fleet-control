import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MapView from './MapView';
import CitizenReport from './CitizenReport'; // הקומפוננטה שנבנה בשלב הבא

export default function App() {
  return (
    <Router>
      <Routes>
        {/* ממשק הסדרן */}
        <Route path="/dispatch" element={<MapView />} />
        
        {/* ממשק האזרח */}
        <Route path="/report" element={<CitizenReport />} />
        
        {/* הפניה אוטומטית לממשק הסדרן כברירת מחדל */}
        <Route path="*" element={<Navigate to="/dispatch" />} />
      </Routes>
    </Router>
  );
}