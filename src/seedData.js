import { db } from "./firebase";
import { collection, doc, setDoc } from "firebase/firestore";

const mockCollectionPoints = [
  {
    id: "point_001",
    lat: 32.0853,
    lng: 34.7818,
    address: "אבן גבירול 70, תל אביב",
    neighborhood: "מרכז העיר",
    city: "תל אביב",
    contactName: "משה כהן",
    contactPhone: "050-1234567",
    lastVisit: new Date().toISOString(),
    status: "GREY", // ממתין לאיסוף
    assignedRouteId: "route_north_1",
    assignedDriverId: "driver_avi",
    photos: { before: "", after: "", issue: "" },
    issueDescription: ""
  },
  {
    id: "point_002",
    lat: 32.0782,
    lng: 34.7741,
    address: "דיזנגוף 101, תל אביב",
    neighborhood: "לב תל אביב",
    city: "תל אביב",
    contactName: "דנה לוי",
    contactPhone: "052-7654321",
    lastVisit: new Date().toISOString(),
    status: "BLUE", // בתהליך איסוף
    assignedRouteId: "route_north_1",
    assignedDriverId: "driver_avi",
    photos: { before: "", after: "", issue: "" },
    issueDescription: ""
  },
  {
    id: "point_003",
    lat: 32.0694,
    lng: 34.7684,
    address: "רוטשילד 32, תל אביב",
    neighborhood: "רוטשילד",
    city: "תל אביב",
    contactName: "ישראל ישראלי",
    contactPhone: "054-1112223",
    lastVisit: new Date().toISOString(),
    status: "GREEN", // איסוף בוצע בהצלחה (כולל תמונות פיקטיביות)
    assignedRouteId: "route_center_2",
    assignedDriverId: "driver_yossi",
    photos: { 
      before: "https://picsum.photos/200/300?random=1", 
      after: "https://picsum.photos/200/300?random=2", 
      issue: "" 
    },
    issueDescription: ""
  },
  {
    id: "point_004",
    lat: 32.0915,
    lng: 34.7725,
    address: "בן יהודה 150, תל אביב",
    neighborhood: "הצפון הישן",
    city: "תל אביב",
    contactName: "רוני בר און",
    contactPhone: "053-9998887",
    lastVisit: new Date().toISOString(),
    status: "RED", // תקלה באיסוף (כולל תיאור)
    assignedRouteId: "route_north_1",
    assignedDriverId: "driver_avi",
    photos: { before: "", after: "", issue: "https://picsum.photos/200/300?random=3" },
    issueDescription: "רכב חונה חוסם את הגישה לפח המוטמן"
  }
];

export const seedDatabase = async () => {
  try {
    const collectionRef = collection(db, "CollectionPoints");
    for (const point of mockCollectionPoints) {
      await setDoc(doc(collectionRef, point.id), point);
    }
    console.log("נתוני הדאמי הועלו בהצלחה ל-Firebase!");
  } catch (error) {
    console.error("שגיאה בהעלאת הנתונים:", error);
  }
};