/**
 * CẤU HÌNH KẾT NỐI REALTIME DATABASE (Dành cho GitHub Pages)
 * -------------------------------------------------------------
 * Nếu bạn muốn người dùng ở khắp mọi nơi (trên các máy tính/điện thoại khác nhau)
 * khi truy cập vào link GitHub Pages đều chat và thấy tin nhắn của nhau theo thời gian thực:
 * 
 * 1. Truy cập https://console.firebase.google.com (Hoàn toàn MIỄN PHÍ)
 * 2. Tạo một Project mới (Ví dụ: "vietboot-chat")
 * 3. Vào mục "Build" -> "Realtime Database" -> Nhấn "Create Database" -> Chọn "Start in test mode"
 * 4. Vào mục Project Settings (Cài đặt dự án) -> Tạo App Web -> Copy các thông số dán vào bên dưới:
 */

const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Cấu hình mật khẩu Admin mặc định cho Chatbox
const DEFAULT_ADMIN_PASSWORD = "admin123";

// Cấu hình số tin nhắn tối đa lưu trữ (Chống tràn bộ nhớ)
const MAX_SAVED_MESSAGES = 100;
