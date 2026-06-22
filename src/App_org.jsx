import { useEffect } from 'react';
import { seedDatabase } from './seedData';

function App() {
  useEffect(() => {
    // מריץ את הזרקת הנתונים פעם אחת כשהאפליקציה עולה
    seedDatabase();
  }, []);

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', textAlign: 'center', color: 'white' }}>
      <h1>מערכת שו"ב פינוי אשפה</h1>
      <p style={{ color: '#888' }}>מזריק נתוני דאמי ל-Firebase...</p>
      <p>בדוק את ה-Firestore Database בדפדפן כדי לראות את הנקודות שנכנסו!</p>
    </div>
  );
}

export default App;