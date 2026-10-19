# Ngày Phụ Nữ — Game đua tay (LG Innotek)

Máy chiếu ở văn phòng + 7 điện thoại làm tay cầm. Server chạy trên máy ở nhà, domain trỏ vào đó.

## Chạy

```bash
npm install
npm start
```

Mặc định cổng `3000`. Đổi cổng: `PORT=8080 npm start` (PowerShell: `$env:PORT=8080; npm start`).

Xem log để biết máy đã lên:

```
http://localhost:3000/health
```

## Mở cho mạng công ty vào được

Cần cả 3 bước, thiếu một là không vào được:

1. **Router ở nhà**: mở port (mặc định `3000`) trỏ về IP máy tính — port forwarding.
2. **Windows Firewall**: cho phép Node.js qua mạng công cộng (Private/Public tùy mạng nhà bạn).
3. **Domain**: đã trỏ IP nhà bạn. Nếu chạy qua Cloudflare Tunnel thì không cần bước 1–2.

Sau khi cấu hình, **thử mở bằng 4G trước khi đến văn phòng**. Đây là bước hay bị bỏ sót nhất.

## Cách dùng ngày thi

| Máy | Mở gì |
|---|---|
| Máy cắm máy chiếu | `http://<domain>/host` |
| Điện thoại (7 máy) | Quét QR trên máy chiếu, hoặc `http://<domain>/play` |

Không có mã phòng. Server chỉ giữ **một phòng duy nhất**, ai mở `/play` là vào slot trống.

Trình tự:

1. Bật máy ở nhà → `npm start` → mở cửa sổ terminal, **không đóng**.
2. Máy chiếu mở `/host`, QR hiện lên.
3. 7 anh em quét QR, gõ tên, vào phòng.
4. Bấm **BẮT ĐẦU** → đếm ngược → đua.
5. Xong có bảng xếp hạng + pháo hoa. Bấm **CHƠI LẠI** để đấu vòng tiếp (giữ nguyên 7 người).

## Luật chơi

- Về đích khi đủ **400 cú chạm** (~1 phút nếu chạy 7–8 cái/giây).
- Máy chiếu bấm **BẮT ĐẦU** bất kể phòng có bao nhiêu người — kể cả 0 người (dùng để thử máy chiếu trước khi có ai vào).
- Điểm do **server tính**, điện thoại không tự gửi điểm được. Chạm trước lúc GO hoặc sau khi về đích đều bị bỏ qua.
- Tối đa 16 chạm/giây/người — chặn script, nhưng vẫn để người thật chạm thoải mái.

## Cứu hộ

| Sự cố | Cách xử lý |
|---|---|
| `EADDRINUSE: port 3000` | Đã có server đang chạy. Kiểm tra bằng `curl http://localhost:3000/health` — nếu trả JSON thì server cũ vẫn ổn, cứ dùng. Muốn chạy lại thì đóng cửa sổ terminal cũ hoặc `taskkill /PID <pid> /F` |
| Có người kẹt / treo, không chạy nổi | Máy chiếu bấm **Đánh dấu về đích** — đánh hạng cho họ luôn |
| Điện thoại mất mạng giữa chừng | Người đó vẫn giữ được thành tích; vào lại `/play` là nhận đúng slot cũ |
| Máy chiếu bị văng ra | F5 là được, mọi thứ tựi đúng |
| Mất điện nhà giữa chừng | Phải đấu lại từ đầu. Nhớ sạc máy, không cho máy ngủ |
| `/host` báo "đã có máy chiếu khác" | Có tab host cũ còn mở. Đóng hết tab host, F5 lại |

## Kiểm tra trước khi dùng

```bash
npm test
```

39 test: logic game (điểm, chống spam, thứ tự về đích) + các vòng đua thật qua WebSocket.

## Cấu trúc

```
server.js         HTTP + WebSocket + sinh QR
game.js           logic thuần của game (không I/O, có test)
test/             test logic + test tích hợp
data/gifts.json   7 món quà — chưa dùng, để dành cho vòng bốc thẻ
public/           giao diện máy chiếu và điện thoại
```

## Ghi chú kỹ thuật

- Không có bước build. Sửa file `.js`/`.css` xong F5 là thấy. Server gửi header `no-store` nên không bị cache.
- Nhân vật pixel vẽ bằng SVG trong `public/js/pixel.js`, màu sinh từ tên — không cần tải asset ngoài, không lo mất mạng lúc chạy.
- Âm thanh tổng hợp bằng WebAudio, không có file nhạc nên không vướng bản quyền.
- Cổng `3000` là HTTP thuần. Nếu domain của bạn là HTTPS thì trang dùng `wss://` — server này không tự chứng thực TLS, nên hãy đặt Cloudflare Tunnel hoặc reverse proxy HTTPS ở trước.