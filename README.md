# 🌐 VIETBOOT - Diễn đàn Kỹ thuật & Chatbox Realtime

Trang web mô phỏng giao diện diễn đàn và hệ thống Chatbox **VietBoot** (chuẩn XenForo/vBulletin shoutbox style), tối ưu 100% để chạy trên **GitHub Pages** hoàn toàn miễn phí.

---

## 🚀 1. Hướng dẫn Đưa lên GitHub Pages (Deploy Miễn Phí 100%)

Bạn có thể đưa toàn bộ trang web này lên mạng để bạn bè cùng truy cập chỉ trong 3 bước:

1. **Tạo Repository mới trên GitHub**:
   - Truy cập [github.com](https://github.com) -> Nhấn **New Repository**.
   - Đặt tên (ví dụ: `vietboot-chatbox`) -> Chọn chế độ **Public** -> Nhấn **Create repository**.

2. **Upload các tệp lên GitHub**:
   - Tải toàn bộ các file trong thư mục này lên GitHub:
     - `index.html`
     - `style.css`
     - `chat.js`
     - `firebase-config.js`
     - `README.md`

3. **Bật GitHub Pages**:
   - Trong Repository của bạn trên GitHub, vào mục **Settings** -> Chọn **Pages** (ở menu bên trái).
   - Tại mục **Branch**, chọn `main` (hoặc `master`) và thư mục `/(root)` -> Nhấn **Save**.
   - Sau khoảng 1-2 phút, GitHub sẽ cung cấp link trang web của bạn: `https://<tên-github-của-bạn>.github.io/vietboot-chatbox/`

---

## ⚡ 2. Cấu hình Chat Trực Tuyến Đa Thiết Bị (Firebase Realtime)

Khi bạn muốn người dùng ở khắp nơi trên máy tính / điện thoại cùng chat và nhìn thấy tin nhắn của nhau tức thì:

1. Truy cập [Firebase Console](https://console.firebase.google.com) (Đăng nhập bằng tài khoản Google miễn phí).
2. Tạo một Dự án mới (ví dụ: `vietboot-chat`).
3. Ở menu bên trái, chọn **Build** -> **Realtime Database** -> Nhấn **Create Database** -> Chọn **Start in test mode**.
4. Vào **Project Settings** (biểu tượng bánh răng) -> Kéo xuống mục **Your apps** -> Chọn biểu tượng Web `</>` -> Copy các thông số config và dán vào file `firebase-config.js`:
```javascript
const FIREBASE_CONFIG = {
    apiKey: "AIzaSy...",
    authDomain: "vietboot-chat.firebaseapp.com",
    databaseURL: "https://vietboot-chat-default-rtdb.firebaseio.com",
    projectId: "vietboot-chat",
    storageBucket: "vietboot-chat.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};
```
*Lưu ý: Nếu không cấu hình Firebase, trang web vẫn hoạt động bình thường ở chế độ Local / Đồng bộ giữa các tab trình duyệt.*

---

## 🛡️ 3. Hệ thống Lệnh Chat & Quản trị Admin

Bạn có thể nhập trực tiếp các lệnh sau vào ô chatbox:

| Lệnh | Quyền hạn | Mô tả |
| :--- | :---: | :--- |
| `/admin <mật_khẩu>` | Mọi người | Đăng nhập Admin (Mật khẩu mặc định: `admin123`) |
| `/clear` hoặc `/cls` | **Admin** | **Xóa sạch toàn bộ lịch sử tin nhắn** trên toàn hệ thống |
| `/notice <nội dung>` | **Admin** | Ghim bảng thông báo nổi bật trên đầu Chatbox |
| `/ban @tên_người_dùng` | **Admin** | Khóa quyền chat của thành viên vi phạm |
| `/unban @tên_người_dùng` | **Admin** | Mở khóa chat cho thành viên |
| `/prune <số_lượng>` | **Admin** | Chỉ giữ lại $N$ tin nhắn mới nhất (VD: `/prune 20`) |
| `/nick <tên_mới>` | Thành viên | Đổi biệt danh nhanh (VD: `/nick PTGAMING`) |
| `/color <mã_màu>` | Thành viên | Đổi màu chữ tên hiển thị (VD: `/color #e74c3c`) |
| `/me <hành_động>` | Thành viên | Gửi tin nhắn trạng thái hành động |
| `/help` | Thành viên | Mở bảng hướng dẫn danh sách lệnh |

### 🗑️ Nút xóa tin nhắn đơn lẻ:
Khi bạn đã đăng nhập quyền Admin, rê chuột vào bất kỳ tin nhắn nào cũng sẽ xuất hiện biểu tượng thùng rác 🗑️ để bạn xóa riêng tin nhắn đó.

---

## 🎨 4. Các tính năng nổi bật khác
- **Trích dẫn (Quote)**: Nhấn biểu tượng quote bên phải tin nhắn hoặc nhập `[quote=Tên]Nội dung[/quote]`.
- **Tag tên (@username)**: Bấm vào tên thành viên trong danh sách Online hoặc gõ `@tên`.
- **Thanh công cụ BBCode**: In đậm `[b]`, In nghiêng `[i]`, Gạch chân `[u]`, Chọn màu chữ, Chèn Link `[url]`, Chèn Ảnh `[img]`.
- **Bộ chọn Emoji**: Hơn 80 biểu tượng cảm xúc phổ biến sẵn sàng sử dụng.
- **Tùy chọn Lưu / Không lưu lịch sử**: Có thể chuyển đổi giữa chế độ Realtime Sync và chế độ Tạm thời (Ephemeral) trong phần Cài đặt tài khoản.
